export function getAiApiKey(): string | undefined {
  return process.env.GOOGLE_AI_STUDIO_API_KEY?.trim();
}

export function getAiEndpoint(): string {
  return process.env.NEXT_PUBLIC_AI_ANALYSIS_URL?.trim() || "/api/ai-analysis";
}
