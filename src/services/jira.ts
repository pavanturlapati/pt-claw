import axios, { AxiosInstance } from "axios";

export type JiraIssueParsed = {
  issueKey: string;
  issueType: string;
  summary: string;
  description: string;
  acceptanceCriteria: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  environment: string;
};

export class JiraNotFoundError extends Error {}
export class JiraServiceError extends Error {}

type JiraServiceConfig = {
  baseUrl: string;
  email: string;
  apiToken: string;
};

export class JiraService {
  private readonly client: AxiosInstance;

  constructor(cfg: JiraServiceConfig) {
    const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
    this.client = axios.create({
      baseURL: cfg.baseUrl.replace(/\/+$/, ""),
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json"
      },
      timeout: 20_000
    });
  }

  async getIssue(issueKey: string): Promise<JiraIssueParsed> {
    try {
      const { data } = await this.client.get(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
        params: { expand: "renderedFields" }
      });

      const fields = data?.fields ?? {};
      const issueType = fields?.issuetype?.name ?? "";
      const summary = fields?.summary ?? "";
      const description = pickDescriptionText(fields).trim();

      const sections = extractSections(description);

      return {
        issueKey: data?.key ?? issueKey,
        issueType,
        summary,
        description,
        acceptanceCriteria: sections.acceptanceCriteria,
        stepsToReproduce: sections.stepsToReproduce,
        expectedResult: sections.expectedResult,
        actualResult: sections.actualResult,
        environment: sections.environment
      };
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new JiraNotFoundError(`Jira issue ${issueKey} not found.`);
      }
      throw new JiraServiceError(`Failed to fetch Jira issue ${issueKey}.`);
    }
  }
}

function pickDescriptionText(fields: any): string {
  if (typeof fields?.description === "string") return fields.description;
  if (fields?.description) return adfToText(fields.description);
  if (typeof fields?.renderedFields?.description === "string") return stripHtml(fields.renderedFields.description);
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function adfToText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";

  const children = Array.isArray(node.content) ? node.content.map(adfToText).join("") : "";

  if (["paragraph", "heading"].includes(node.type)) return `${children}\n`;
  if (["bulletList", "orderedList"].includes(node.type)) return `${children}\n`;
  if (node.type === "listItem") return `- ${children}\n`;

  return children;
}

type ExtractedSections = {
  acceptanceCriteria: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  environment: string;
};

function extractSections(text: string): ExtractedSections {
  const lines = text.split(/\r?\n/);
  const headingMap: Record<keyof ExtractedSections, string[]> = {
    acceptanceCriteria: ["acceptance criteria", "ac"],
    stepsToReproduce: ["steps to reproduce", "str", "repro steps", "steps"],
    expectedResult: ["expected result", "expected behavior", "expected"],
    actualResult: ["actual result", "actual behavior", "actual"],
    environment: ["environment", "env", "test environment"]
  };

  const allHeadings = Object.values(headingMap).flat();
  const result: ExtractedSections = {
    acceptanceCriteria: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
    environment: ""
  };

  (Object.keys(headingMap) as Array<keyof ExtractedSections>).forEach((key) => {
    result[key] = extractSection(lines, headingMap[key], allHeadings);
  });

  return result;
}

function extractSection(lines: string[], aliases: string[], allHeadings: string[]): string {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (matchesHeading(lines[i], aliases)) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return "";

  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (matchesHeading(lines[i], allHeadings)) break;
    body.push(lines[i]);
  }

  return body.join("\n").trim();
}

function normalizeHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/^[#*\-\d.\s]+/, "")
    .replace(/[:\-\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesHeading(line: string, aliases: string[]): boolean {
  const normalized = normalizeHeading(line);
  return aliases.some((a) => normalized === a || normalized.startsWith(`${a} `));
}