import axios from "axios";

/**
 * Cấu hình timeout mặc định 10 phút (600.000 ms) cho AI requests
 * Thích hợp cho các model suy luận sâu (high reasoning) như gemini-flash-latest
 */
export const AI_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_AI_TIMEOUT_MS || process.env.AI_TIMEOUT_MS) || 10 * 60 * 1000;

export const aiClient = axios.create({
  timeout: AI_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});
