import axios from "axios";
import { WebClient } from "@slack/web-api";

export class SlackService {
  private readonly client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  async postResponseUrl(responseUrl: string, text: string, responseType: "ephemeral" | "in_channel" = "ephemeral"): Promise<void> {
    await axios.post(
      responseUrl,
      {
        response_type: responseType,
        text
      },
      { timeout: 15_000 }
    );
  }

  private async ensureInChannel(channel: string): Promise<void> {
    try {
      await this.client.conversations.join({ channel });
    } catch (err: any) {
      const slackErr = err?.data?.error;
      // Best-effort join. These outcomes are safe to ignore:
      // - already_in_channel: bot is already present
      // - method_not_supported_for_channel_type: DMs/private channels
      // - channel_not_found: caller may still use response_url-only flow
      if (
        slackErr === "already_in_channel" ||
        slackErr === "missing_scope" ||
        slackErr === "method_not_supported_for_channel_type" ||
        slackErr === "channel_not_found"
      ) {
        return;
      }
      throw err;
    }
  }

  async postMessage(channel: string, text: string, threadTs?: string): Promise<void> {
    await this.ensureInChannel(channel);
    await this.client.chat.postMessage({
      channel,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {})
    });
  }

  async uploadTextFile(channel: string, filename: string, content: string, threadTs?: string): Promise<void> {
    await this.ensureInChannel(channel);
    await this.client.files.uploadV2({
      channel_id: channel,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      file_uploads: [
        {
          filename,
          title: filename,
          content
        }
      ]
    });
  }
}
