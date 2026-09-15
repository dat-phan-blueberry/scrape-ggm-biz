import { handleAuditRequest } from "../supabase/functions/ai-analysis/handler.ts";

Deno.serve({ hostname: "127.0.0.1", port: 3111 }, handleAuditRequest);
