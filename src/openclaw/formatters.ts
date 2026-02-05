import type { AIResponse } from "./schema";

type ScenarioType = "Positive" | "Negative" | "Edge";

type FlatScenario = {
  scenarioType: ScenarioType;
  title: string;
  priority: "High" | "Medium" | "Low";
  gherkin: string;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "when",
  "then",
  "user",
  "story",
  "bug",
  "issue",
  "should",
  "cannot",
  "error"
]);

function inferKeywords(summary: string): string[] {
  const tokens = summary
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

  return Array.from(new Set(tokens)).slice(0, 3);
}

function buildLabels(issueType: string, summary: string): string[] {
  return ["pt-claw", "clawcraft", issueType.toLowerCase(), ...inferKeywords(summary)];
}

function flattenScenarios(ai: AIResponse): FlatScenario[] {
  return [
    ...ai.gherkin.positive.map((s) => ({ scenarioType: "Positive" as const, ...s })),
    ...ai.gherkin.negative.map((s) => ({ scenarioType: "Negative" as const, ...s })),
    ...ai.gherkin.edge.map((s) => ({ scenarioType: "Edge" as const, ...s }))
  ];
}

function csvEscape(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

export function buildXrayJson(ai: AIResponse): string {
  const labels = buildLabels(ai.issueType, ai.summary);
  const tests = flattenScenarios(ai).map((s) => ({
    testType: "Manual",
    scenarioType: s.scenarioType,
    feature: ai.gherkin.feature,
    title: s.title,
    priority: s.priority,
    labels,
    gherkin: s.gherkin
  }));

  return JSON.stringify(
    {
      requirementKey: ai.issueKey,
      tests
    },
    null,
    2
  );
}

export function buildXrayCsv(ai: AIResponse): string {
  const labels = buildLabels(ai.issueType, ai.summary).join(";");
  const header = [
    "IssueKey",
    "RequirementKey",
    "TestType",
    "ScenarioType",
    "Feature",
    "ScenarioTitle",
    "Priority",
    "Labels",
    "Gherkin"
  ];

  const rows = flattenScenarios(ai).map((s) =>
    [
      ai.issueKey,
      ai.issueKey,
      "Manual",
      s.scenarioType,
      ai.gherkin.feature,
      s.title,
      s.priority,
      labels,
      s.gherkin
    ]
      .map((v) => csvEscape(String(v)))
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}

export function buildOutputFiles(ai: AIResponse): Array<{ filename: string; contentType: string; content: string }> {
  return [
    {
      filename: `${ai.issueKey}_xray_tests.csv`,
      contentType: "text/csv",
      content: buildXrayCsv(ai)
    },
    {
      filename: `${ai.issueKey}_xray_tests.json`,
      contentType: "application/json",
      content: buildXrayJson(ai)
    }
  ];
}