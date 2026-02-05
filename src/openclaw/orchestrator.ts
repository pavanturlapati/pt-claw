import { v4 as uuidv4 } from "uuid";
import { JiraNotFoundError, JiraService, type JiraIssueParsed } from "../services/jira";
import { SlackService } from "../services/slack";
import { OpenAIService } from "../services/openai";
import { buildPrompt } from "./prompt";
import { aiResponseSchema, type AIResponse } from "./schema";
import { buildOutputFiles } from "./formatters";

type Deps = {
  jira: JiraService;
  slack: SlackService;
  openai: OpenAIService;
};

export type SlashCommandContext = {
  issueKey: string;
  userRequestedGenerateScript: boolean;
  command: string;
  text: string;
  teamId: string;
  channelId: string;
  userId: string;
  responseUrl: string;
  threadTs?: string;
};

export class OpenClawOrchestrator {
  constructor(private readonly deps: Deps) {}

  async handleSlashCommand(ctx: SlashCommandContext): Promise<void> {
    const correlationId = uuidv4();
    console.log(`[${correlationId}] Received ${ctx.command} ${ctx.text}`);

    try {
      const issue = await this.deps.jira.getIssue(ctx.issueKey);
      const issueTypeLower = issue.issueType.toLowerCase();

      if (!isSupportedIssueType(issueTypeLower)) {
        await this.deps.slack.postResponseUrl(
          ctx.responseUrl,
          `Unsupported issue type: "${issue.issueType}". Supported: User Story or Bug. (correlation: ${correlationId})`
        );
        return;
      }

      const isBug = isBugType(issueTypeLower);
      const hasSteps = Boolean(issue.stepsToReproduce.trim());
      const platformHint = inferPlatformHint(issue);

      const prompt = buildPrompt({
        issueKey: issue.issueKey,
        issueTypeName: issue.issueType,
        summary: issue.summary,
        description: issue.description,
        acceptanceCriteria: issue.acceptanceCriteria,
        stepsToReproduce: issue.stepsToReproduce,
        expectedResult: issue.expectedResult,
        actualResult: issue.actualResult,
        environment: issue.environment,
        platformHint,
        userRequestedGenerateScript: ctx.userRequestedGenerateScript
      });

      let ai = await this.generateAndValidate(prompt.system, prompt.user, correlationId);

      if (ctx.userRequestedGenerateScript && (!isBug || !hasSteps)) {
        ai = {
          ...ai,
          automation: {
            included: false,
            target: null,
            language: null,
            script: "",
            selectors_and_mappings: [],
            notes: [
              ...(ai.automation?.notes ?? []),
              !isBug
                ? "Script was requested but issue type is not Bug."
                : "Script was requested but bug lacks clear Steps to Reproduce."
            ]
          }
        };
      }

      const generatedFiles = buildOutputFiles(ai);
      const aiCsvFile = ai.files.find((f) => f.contentType === "text/csv");
      const aiJsonFile = ai.files.find((f) => f.contentType === "application/json");

      const files = [
        {
          filename: aiCsvFile?.filename || generatedFiles[0].filename,
          content: generatedFiles[0].content
        },
        {
          filename: aiJsonFile?.filename || generatedFiles[1].filename,
          content: generatedFiles[1].content
        }
      ];

      for (const file of files) {
        await this.deps.slack.uploadTextFile(ctx.channelId, file.filename, file.content, ctx.threadTs);
      }

      const summary = [
        `✅ ClawCraft complete`,
        `- Issue: ${ai.issueKey} (${ai.issueType})`,
        `- Scenarios: Positive=${ai.gherkin.positive.length}, Negative=${ai.gherkin.negative.length}, Edge=${ai.gherkin.edge.length}`,
        `- Automation script included: ${ai.automation.included ? "Yes" : "No"}${
          ctx.userRequestedGenerateScript && !hasSteps && isBug ? " (missing Steps to Reproduce)" : ""
        }`,
        `- Correlation ID: ${correlationId}`
      ].join("\n");

      await this.deps.slack.postMessage(ctx.channelId, summary, ctx.threadTs);
    } catch (err: any) {
      console.error(`[${correlationId}] Error`, err);

      if (err instanceof JiraNotFoundError) {
        await this.deps.slack.postResponseUrl(
          ctx.responseUrl,
          `I couldn't find Jira issue ${ctx.issueKey}. Please check the key and try again. (correlation: ${correlationId})`
        );
        return;
      }

      await this.deps.slack.postResponseUrl(
        ctx.responseUrl,
        `Failed to process ${ctx.issueKey}. ${
          err?.message?.includes("OpenAI") ? "OpenAI generation failed." : "Please try again."
        } (correlation: ${correlationId})`
      );
    }
  }

  private async generateAndValidate(system: string, user: string, correlationId: string): Promise<AIResponse> {
    const first = await this.deps.openai.generate(system, user);
    const parsedFirst = tryParseAndValidate(first);
    if (parsedFirst.ok) return parsedFirst.data;

    console.warn(`[${correlationId}] Invalid AI output, attempting one repair.`);

    const repaired = await this.deps.openai.repair(first);
    const parsedRepair = tryParseAndValidate(repaired);
    if (parsedRepair.ok) return parsedRepair.data;

    throw new Error(`OpenAI invalid JSON after repair: ${parsedRepair.reason}`);
  }
}

function isSupportedIssueType(issueTypeLower: string): boolean {
  return isBugType(issueTypeLower) || issueTypeLower.includes("story");
}

function isBugType(issueTypeLower: string): boolean {
  return issueTypeLower.includes("bug");
}

function inferPlatformHint(issue: JiraIssueParsed): "WEB" | "MOBILE" | "UNKNOWN" {
  const hay = [
    issue.summary,
    issue.description,
    issue.stepsToReproduce,
    issue.environment,
    issue.expectedResult,
    issue.actualResult
  ]
    .join(" ")
    .toLowerCase();

  const mobileWords = ["ios", "android", "apk", "ipa", "device", "appium", "emulator", "simulator"];
  const webWords = ["browser", "url", "webpage", "playwright", "chrome", "firefox", "safari"];

  if (mobileWords.some((w) => hay.includes(w))) return "MOBILE";
  if (webWords.some((w) => hay.includes(w))) return "WEB";
  return "UNKNOWN";
}

function tryParseAndValidate(raw: string): { ok: true; data: AIResponse } | { ok: false; reason: string } {
  try {
    const cleaned = unwrapCodeFence(raw.trim());
    const obj = JSON.parse(cleaned);
    const parsed = aiResponseSchema.safeParse(obj);
    if (!parsed.success) {
      return { ok: false, reason: parsed.error.message };
    }
    return { ok: true, data: parsed.data };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "Unknown JSON parse error" };
  }
}

function unwrapCodeFence(s: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  return fence ? fence[1] : s;
}