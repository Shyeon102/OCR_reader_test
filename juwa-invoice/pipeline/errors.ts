// Keep diagnostics useful without printing request headers or full API bodies.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error";
  const parts = [error.message.split(/\s*Body:/)[0]];
  if ("statusCode" in error) parts.unshift(`HTTP ${error.statusCode}`);
  if ("code" in error) parts.push(`code=${error.code}`);
  if ("body" in error && typeof error.body === "string") {
    try {
      const body = JSON.parse(error.body);
      const message = body.message ?? body.error?.message ?? body.detail;
      if (typeof message === "string") parts.push(message);
      if (Array.isArray(message)) {
        // Validation errors may include the original input: log only location/type/message.
        for (const item of message) {
          parts.push(`${JSON.stringify(item.loc)}: ${item.msg ?? item.type}`);
        }
      }
    } catch {
      // Non-JSON responses are intentionally omitted.
    }
  }
  if (error.cause instanceof Error) parts.push(describeError(error.cause));
  let text = parts.join(" | ");
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (key) text = text.replaceAll(key, "[REDACTED]");
  return text.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").slice(0, 1500);
}
