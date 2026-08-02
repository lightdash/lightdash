import { type AiSqlApprovalDecision } from '../../../database/entities/ai';

// SQL approval decisions (approved / rejected) persist per tool call in the
// `ai_sql_approval` table; the thread-level "approve & don't ask again" flag
// persists on `ai_thread.sql_auto_approved_at`. Both survive pod restarts and
// cross-pod requests (Slack interactivity is handled by the API pod while the
// agent runs on the scheduler worker).

export type SqlApprovalDecision = AiSqlApprovalDecision | 'timeout';
