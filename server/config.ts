import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  AI_BASE_URL: z.string().min(1),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().default(30000),
  AI_MAX_RETRIES: z.coerce.number().default(2),
  AI_JSON_MODE: z.enum(["json_schema", "json_object", "text"]).default("json_schema"),
  AI_THINKING_LEVEL: z.enum(["low", "medium", "high"]).default("low"),
  TTS_MODEL: z.string().min(1).default("gemini-2.5-flash-tts"),
  TTS_VOICE: z.string().min(1).default("Leda"),
  TTS_STYLE: z.string().min(1).default("با صدایی کودکانه، گرم، بازیگوش، طبیعی و به فارسی معیار ایران"),
});

export type ServerConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return envSchema.parse(env);
}
