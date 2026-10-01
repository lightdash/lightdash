import { FilterOperator, MetricType } from '@lightdash/common';
import type { CompactedStreamColumn } from '../eventStream/types';
import type { SystemMetricDefinition } from './systemStreamMetrics';

export const agentRequestsColumns: CompactedStreamColumn[] = [
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'user_id', type: 'VARCHAR' },
    { name: 'agent_id', type: 'VARCHAR' },
    { name: 'thread_id', type: 'VARCHAR' },
    { name: 'prompt_id', type: 'VARCHAR' },
    { name: 'surface', type: 'VARCHAR' },
    { name: 'requested_at', type: 'TIMESTAMP' },
    { name: 'responded_at', type: 'TIMESTAMP' },
    { name: 'status', type: 'VARCHAR' },
    { name: 'request_latency_ms', type: 'BIGINT' },
    { name: 'retry_count', type: 'BIGINT' },
    { name: 'retry_overhead_ms', type: 'BIGINT' },
    { name: 'feedback_score', type: 'INTEGER' },
    { name: 'feedback_updates', type: 'BIGINT' },
    { name: 'ai_call_count', type: 'BIGINT' },
    { name: 'known_token_call_count', type: 'BIGINT' },
    { name: 'total_tokens', type: 'BIGINT' },
];

// Read-time grouping keeps the request grain stable and lets late lifecycle
// events join a request even when they arrive in a later nightly partition.
// Only creation events create rows; an orphan outcome cannot invent a request.
export const agentRequestsSql = `(WITH events AS (
    SELECT * FROM agent_request_events
    WHERE event_id IS NOT NULL AND prompt_id IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, event_id ORDER BY event_ts DESC) = 1
), starts AS (
    SELECT org_id, project_id, user_id, agent_id, thread_id, prompt_id,
        surface, event_ts AS requested_at
    FROM events WHERE stage = 'created'
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, prompt_id ORDER BY event_ts, event_id) = 1
), latest_status AS (
    SELECT org_id, prompt_id,
        CASE stage
            WHEN 'outcome' THEN outcome
            WHEN 'clarification_requested' THEN 'clarification'
            WHEN 'interrupted' THEN 'cancelled'
            ELSE 'pending'
        END AS status,
        CASE WHEN stage = 'retry_started' THEN NULL ELSE event_ts END AS responded_at
    FROM events
    WHERE stage IN ('outcome', 'retry_started', 'clarification_requested', 'interrupted')
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, prompt_id ORDER BY event_ts DESC, event_id DESC) = 1
), timeline AS (
    SELECT *, MAX(CASE WHEN stage IN ('created', 'retry_started') THEN event_ts END)
        OVER (PARTITION BY org_id, prompt_id ORDER BY event_ts, event_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS attempt_started_at
    FROM events
), retries AS (
    SELECT org_id, prompt_id, COUNT(*)::BIGINT AS retry_count
    FROM events WHERE stage = 'retry_started'
    GROUP BY org_id, prompt_id
), failed_attempts AS (
    SELECT t.org_id, t.prompt_id,
        SUM(date_diff('millisecond', t.attempt_started_at, t.event_ts))::BIGINT AS retry_overhead_ms
    FROM timeline t
    WHERE t.stage = 'outcome' AND t.outcome = 'error'
        AND t.attempt_started_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM events r WHERE r.org_id = t.org_id
            AND r.prompt_id = t.prompt_id AND r.stage = 'retry_started'
            AND r.event_ts > t.event_ts)
    GROUP BY t.org_id, t.prompt_id
), latest_feedback AS (
    SELECT org_id, prompt_id, NULLIF(human_score, 0) AS feedback_score
    FROM events WHERE stage = 'feedback_updated'
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, prompt_id ORDER BY event_ts DESC, event_id DESC) = 1
), feedback_counts AS (
    SELECT org_id, prompt_id, COUNT(*)::BIGINT AS feedback_updates
    FROM events WHERE stage = 'feedback_updated'
    GROUP BY org_id, prompt_id
), deduped_ai AS (
    SELECT org_id, project_id, prompt_id, event_id, total_tokens
    FROM ai_usage
    WHERE prompt_id IS NOT NULL AND event_id IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (PARTITION BY org_id, event_id ORDER BY event_ts DESC) = 1
), consumption AS (
    SELECT org_id, project_id, prompt_id, COUNT(*)::BIGINT AS ai_call_count,
        COUNT(total_tokens)::BIGINT AS known_token_call_count,
        SUM(total_tokens)::BIGINT AS total_tokens
    FROM deduped_ai GROUP BY org_id, project_id, prompt_id
)
SELECT s.*, ls.responded_at, COALESCE(ls.status, 'pending') AS status,
    CASE WHEN ls.responded_at IS NOT NULL
        THEN date_diff('millisecond', s.requested_at, ls.responded_at)::BIGINT END AS request_latency_ms,
    COALESCE(r.retry_count, 0)::BIGINT AS retry_count,
    COALESCE(fa.retry_overhead_ms, 0)::BIGINT AS retry_overhead_ms,
    lf.feedback_score, COALESCE(fc.feedback_updates, 0)::BIGINT AS feedback_updates,
    COALESCE(c.ai_call_count, 0)::BIGINT AS ai_call_count,
    COALESCE(c.known_token_call_count, 0)::BIGINT AS known_token_call_count,
    c.total_tokens
FROM starts s
LEFT JOIN latest_status ls USING (org_id, prompt_id)
LEFT JOIN retries r USING (org_id, prompt_id)
LEFT JOIN failed_attempts fa USING (org_id, prompt_id)
LEFT JOIN latest_feedback lf USING (org_id, prompt_id)
LEFT JOIN feedback_counts fc USING (org_id, prompt_id)
LEFT JOIN consumption c ON c.org_id = s.org_id AND c.project_id = s.project_id
    AND c.prompt_id = s.prompt_id)`;

export const agentRequestsMetrics: SystemMetricDefinition[] = [
    {
        name: 'total_requests',
        description:
            'Distinct captured human prompts, including pending and failed requests',
        type: MetricType.COUNT,
        column: 'prompt_id',
    },
    {
        name: 'distinct_requesters',
        description:
            'Distinct identified people who submitted captured prompts',
        type: MetricType.COUNT_DISTINCT,
        column: 'user_id',
    },
    ...[
        ['successful_requests', 'success'],
        ['failed_requests', 'error'],
        ['clarification_requests', 'clarification'],
        ['cancelled_requests', 'cancelled'],
        ['pending_requests', 'pending'],
    ].map(([name, status]) => ({
        name,
        type: MetricType.COUNT,
        column: 'prompt_id',
        filters: [
            {
                id: name,
                target: { fieldRef: 'status' },
                operator: FilterOperator.EQUALS,
                values: [status],
            },
        ],
    })),
    {
        name: 'average_request_latency_ms',
        description:
            'Mean time from prompt creation to the latest observed outcome; pending requests are excluded',
        type: MetricType.AVERAGE,
        column: 'request_latency_ms',
    },
    { name: 'total_retries', type: MetricType.SUM, column: 'retry_count' },
    {
        name: 'total_retry_overhead_ms',
        type: MetricType.SUM,
        column: 'retry_overhead_ms',
    },
    { name: 'total_ai_calls', type: MetricType.SUM, column: 'ai_call_count' },
    {
        name: 'total_request_tokens',
        type: MetricType.SUM,
        column: 'total_tokens',
    },
];
