import { z } from "zod";

const scenarioSchema = z
  .object({
    title: z.string().min(1),
    priority: z.enum(["High", "Medium", "Low"]),
    gherkin: z.string().min(1)
  })
  .strict();

const gherkinSchema = z
  .object({
    feature: z.string().min(1),
    positive: z.array(scenarioSchema).min(5),
    negative: z.array(scenarioSchema).min(5),
    edge: z.array(scenarioSchema).min(5)
  })
  .strict();

const fileSchema = z
  .object({
    filename: z.string().min(1),
    contentType: z.enum(["text/csv", "application/json"]),
    content: z.string().min(1)
  })
  .strict();

const automationSchema = z
  .object({
    included: z.boolean(),
    target: z.enum(["playwright", "appium"]).nullable(),
    language: z.enum(["TypeScript", "Python"]).nullable(),
    script: z.string(),
    selectors_and_mappings: z.array(z.string()),
    notes: z.array(z.string())
  })
  .strict();

export const aiResponseSchema = z
  .object({
    issueKey: z.string().min(1),
    issueType: z.string().min(1),
    summary: z.string().min(1),
    assumptions: z.array(z.string()),
    gherkin: gherkinSchema,
    files: z.array(fileSchema).min(2),
    automation: automationSchema
  })
  .strict();

export type AIResponse = z.infer<typeof aiResponseSchema>;