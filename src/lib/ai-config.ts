export function getAiApiKey(): string | undefined {
  return process.env.GOOGLE_AI_STUDIO_API_KEY?.trim();
}
