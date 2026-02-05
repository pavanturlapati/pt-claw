import OpenAI from "openai";

export class OpenAIService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(systemMessage: string, userMessage: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ]
    });

    return response.choices[0]?.message?.content ?? "";
  }

  async repair(invalidOutput: string): Promise<string> {
    const repairPrompt = `Return ONLY valid JSON matching the schema. Here is the invalid output: ${invalidOutput}`;
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [{ role: "user", content: repairPrompt }]
    });

    return response.choices[0]?.message?.content ?? "";
  }
}