import "dotenv/config";
import express from "express";
import { z } from "zod";
import { JiraService } from "./services/jira";
import { SlackService } from "./services/slack";
import { OpenAIService } from "./services/openai";
import { OpenClawOrchestrator } from "./openclaw/orchestrator";
import { createSlackCommandsRouter } from "./routes/slackCommands";

const envSchema = z.object({
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  JIRA_BASE_URL: z.string().url(),
  JIRA_EMAIL: z.string().email(),
  JIRA_API_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1"),
  PORT: z.string().default("3000")
});

const env = envSchema.parse(process.env);

const app = express();

app.use(
  express.urlencoded({
    extended: false,
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
    }
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const jira = new JiraService({
  baseUrl: env.JIRA_BASE_URL,
  email: env.JIRA_EMAIL,
  apiToken: env.JIRA_API_TOKEN
});
const slack = new SlackService(env.SLACK_BOT_TOKEN);
const openai = new OpenAIService(env.OPENAI_API_KEY, env.OPENAI_MODEL);

const orchestrator = new OpenClawOrchestrator({
  jira,
  slack,
  openai
});

app.use(
  "/slack",
  createSlackCommandsRouter({
    signingSecret: env.SLACK_SIGNING_SECRET,
    orchestrator
  })
);

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`pt-claw listening on http://localhost:${port}`);
});