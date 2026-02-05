import { Router } from "express";
import { z } from "zod";
import { assertSlackSignature } from "../utils/slackSignature";
import type { OpenClawOrchestrator } from "../openclaw/orchestrator";

const slashBodySchema = z.object({
  token: z.string().optional(),
  team_id: z.string(),
  team_domain: z.string().optional(),
  channel_id: z.string(),
  channel_name: z.string().optional(),
  user_id: z.string(),
  user_name: z.string().optional(),
  command: z.string(),
  text: z.string().default(""),
  response_url: z.string().url(),
  trigger_id: z.string().optional()
});

type Deps = {
  signingSecret: string;
  orchestrator: OpenClawOrchestrator;
};

function parseCommandText(text: string): { issueKey?: string; generateScript: boolean } {
  const trimmed = (text || "").trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const issueKey = tokens[0]?.toUpperCase();
  const validIssue = issueKey && /^[A-Z][A-Z0-9]+-\d+$/.test(issueKey) ? issueKey : undefined;
  const generateScript = /\bgenerate\s+script\b/i.test(trimmed);
  return { issueKey: validIssue, generateScript };
}

export function createSlackCommandsRouter({ signingSecret, orchestrator }: Deps): Router {
  const router = Router();

  router.post("/commands", async (req, res) => {
    const sig = assertSlackSignature(req, signingSecret);
    if (!sig.ok) {
      return res.status(401).send("Invalid Slack signature.");
    }

    const parsedBody = slashBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).send("Invalid slash command payload.");
    }

    const body = parsedBody.data;
    const parsed = parseCommandText(body.text);

    if (!parsed.issueKey) {
      return res.status(200).send("Usage: /clawcraft PROJ-123 [generate script]");
    }

    res
      .status(200)
      .send(`Working on ${parsed.issueKey}... I'll reply in this thread with CSV/JSON.`);

    void orchestrator
      .handleSlashCommand({
        issueKey: parsed.issueKey,
        userRequestedGenerateScript: parsed.generateScript,
        command: body.command,
        text: body.text,
        teamId: body.team_id,
        channelId: body.channel_id,
        userId: body.user_id,
        responseUrl: body.response_url
      })
      .catch((err) => {
        console.error("Unhandled async command error:", err);
      });
  });

  return router;
}