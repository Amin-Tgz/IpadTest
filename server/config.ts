import "dotenv/config";
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
});

export type ServerConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return envSchema.parse(env);
}

export const config: ServerConfig = loadConfig();
