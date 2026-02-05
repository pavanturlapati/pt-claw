import crypto from "crypto";
import type { Request } from "express";

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: string;
  }
}

type VerifyParams = {
  signingSecret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string | undefined;
};

export function verifySlackSignature({
  signingSecret,
  timestamp,
  signature,
  rawBody
}: VerifyParams): { ok: true } | { ok: false; reason: string } {
  if (!timestamp || !signature || !rawBody) {
    return { ok: false, reason: "Missing Slack signature headers or body." };
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: "Invalid Slack timestamp." };
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (ageSeconds > 60 * 5) {
    return { ok: false, reason: "Slack timestamp outside tolerance window." };
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "Slack signature mismatch." };
  }

  return { ok: true };
}

export function assertSlackSignature(req: Request, signingSecret: string): { ok: true } | { ok: false; reason: string } {
  return verifySlackSignature({
    signingSecret,
    timestamp: req.headers["x-slack-request-timestamp"] as string | undefined,
    signature: req.headers["x-slack-signature"] as string | undefined,
    rawBody: req.rawBody
  });
}