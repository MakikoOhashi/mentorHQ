export type DeliberationConfig = {
  apiKey: string;
  model: string;
};

export function getDeliberationConfig(): DeliberationConfig {
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash"
  };
}

export function hasGeminiConfig(config: DeliberationConfig): boolean {
  return config.apiKey.length > 0;
}
