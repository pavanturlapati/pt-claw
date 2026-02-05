type PromptInput = {
  issueKey: string;
  issueTypeName: string;
  summary: string;
  description: string;
  acceptanceCriteria: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  environment: string;
  platformHint: "WEB" | "MOBILE" | "UNKNOWN";
  userRequestedGenerateScript: boolean;
};

export function buildPrompt(input: PromptInput): { system: string; user: string } {
  const system =
    "You are ClawCraft QA, an expert QA analyst + test automation engineer. Return ONLY valid JSON matching the required schema. Do not include markdown.";

  const user = `Context:
- Jira is the source of truth.
- Xray Cloud will be used to import Test entities.
- Slack command is /clawcraft <ISSUE_KEY> [generate script]
- Always trust Jira's issuetype.name to decide whether it's a User Story or Bug.

Your tasks:
1) If issuetype.name indicates User Story or Bug:
   - Generate Positive, Negative, and Edge test cases in valid Gherkin.
   - Produce TWO export payloads: CSV text and JSON text.
   - The tests must be suitable to create Xray Cloud Test entities linked back to the Requirement (story/bug).
2) Only if BOTH conditions are true:
   - issuetype.name is Bug (or equivalent)
   - userRequestedGenerateScript=true
   AND the bug includes clear steps to reproduce
   => generate an automation script:
      - Playwright (TypeScript) for web when platformHint=WEB
      - Appium (Python) for mobile when platformHint=MOBILE
      - If platformHint is UNKNOWN, infer from text; if still unclear, default to Playwright TS and state assumption.

Quality rules:
- Be faithful to the issue text; do not invent features.
- If info is missing, keep assumptions minimal and list them explicitly.
- Gherkin must use Feature/Scenario and Given/When/Then.
- Scenario titles must be stable: "<ISSUE_KEY> - <short intent> - (<Positive|Negative|Edge>)"
- Minimum coverage: at least 5 Positive, 5 Negative, 5 Edge scenarios.
- Tag each scenario with priority High/Medium/Low:
  - High: core path, auth, payments, data loss, security, crash
  - Medium: common alternate paths
  - Low: rare/cosmetic

Output format (STRICT):
Return a single JSON object with these keys:

{
  "issueKey": "...",
  "issueType": "...",
  "summary": "...",
  "assumptions": ["..."],
  "gherkin": {
    "feature": "...",
    "positive": [{"title":"...","priority":"...","gherkin":"..."}],
    "negative": [{"title":"...","priority":"...","gherkin":"..."}],
    "edge": [{"title":"...","priority":"...","gherkin":"..."}]
  },
  "files": [
    {
      "filename": "<ISSUE_KEY>_xray_tests.csv",
      "contentType": "text/csv",
      "content": "<CSV_TEXT>"
    },
    {
      "filename": "<ISSUE_KEY>_xray_tests.json",
      "contentType": "application/json",
      "content": "<JSON_TEXT>"
    }
  ],
  "automation": {
    "included": true/false,
    "target": "playwright|appium|null",
    "language": "TypeScript|Python|null",
    "script": "<FULL_SCRIPT_OR_EMPTY>",
    "selectors_and_mappings": ["..."],
    "notes": ["..."]
  }
}

CSV rules (temporary placeholder until official template is supplied):
- Use columns:
  IssueKey, RequirementKey, TestType, ScenarioType, Feature, ScenarioTitle, Priority, Labels, Gherkin
- RequirementKey must equal the Jira issueKey.
- TestType must be "Manual".
- Labels must include: "pt-claw", "clawcraft", plus issueType lowercased, plus up to 3 keywords inferred from summary.

JSON rules:
- The JSON inside <ISSUE_KEY>_xray_tests.json must be:
  {
    "requirementKey": "<ISSUE_KEY>",
    "tests": [
      {
        "testType": "Manual",
        "scenarioType": "Positive|Negative|Edge",
        "feature": "...",
        "title": "...",
        "priority": "High|Medium|Low",
        "labels": ["..."],
        "gherkin": "..."
      }
    ]
  }

Now process this Jira issue input:

<JIRA_ISSUE>
issueKey: ${input.issueKey}
issuetype.name: ${input.issueTypeName}
summary: ${input.summary}
description: ${input.description}
acceptanceCriteria: ${input.acceptanceCriteria}
stepsToReproduce: ${input.stepsToReproduce}
expectedResult: ${input.expectedResult}
actualResult: ${input.actualResult}
environment: ${input.environment}
platformHint: ${input.platformHint}
userRequestedGenerateScript: ${input.userRequestedGenerateScript}
</JIRA_ISSUE>`;

  return { system, user };
}