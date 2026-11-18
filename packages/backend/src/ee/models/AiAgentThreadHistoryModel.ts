import {
    HIDDEN_AI_AGENT_REVIEW_ROOT_CAUSES,
    type AiAgentReviewClassifierConfidence,
    type AiAgentRootCause,
    type AiAgentThreadHistoryClassification,
    type AiAgentThreadHistorySearchMatch,
    type AiAgentThreadHistorySearchResult,
    type AiAgentThreadHistorySummary,
    type AiAgentTurnSignal,
    type AiThreadCreatedFrom,
} from '@lightdash/common';
import { type Knex } from 'knex';

type Dependencies = { database: Knex };

/**
 * Which threads a query may return. The service resolves it from the existing
 * permission rules; the model only applies it.
 *
 * `mine` selects threads like `AiAgentModel.findThreadsPaginated` (the project
 * thread list). `all` selects them like `findAdminThreadsPaginated` (the AI
 * admin thread list). The two lists define a thread's project, owner and
 * existence differently, so the mode keeps each definition intact.
 */
export type AiAgentThreadHistoryModelScope = {
    organizationUuid: string;
    mode: 'mine' | 'all';
    /** Null: every project of the organization (`all` mode only). */
    projectUuids: string[] | null;
    agentUuids: string[] | null;
    ownerUserUuid: string | null;
    createdFrom: AiThreadCreatedFrom[];
    dateFrom?: string;
    dateTo?: string;
    hasError?: boolean;
    humanScore?: number;
    signal?: AiAgentTurnSignal;
    rootCause?: AiAgentRootCause;
    includeClassification: boolean;
};

export type AiAgentThreadHistoryTurnRow = {
    promptUuid: string;
    createdAt: Date;
    prompt: string;
    promptLength: number;
    response: string | null;
    responseLength: number | null;
    errorMessage: string | null;
    humanScore: number | null;
    humanFeedback: string | null;
};

export type AiAgentThreadHistoryToolCallRow = {
    promptUuid: string;
    toolCallId: string;
    name: string;
    args: unknown;
    result: string | null;
    isError: boolean;
    source: 'lightdash' | 'mcp';
};

type SummaryRow = {
    ai_thread_uuid: string;
    project_uuid: string;
    agent_uuid: string;
    agent_name: string;
    title: string | null;
    created_at: Date;
    created_at_cursor: string;
    created_from: AiThreadCreatedFrom;
    owner_user_uuid: string | null;
    owner_name: string;
    first_prompt: string | null;
    turn_count: number;
    error_count: number;
    upvote_count: number;
    downvote_count: number;
    classified_turn_count?: number;
    classified_turns?: {
        promptUuid: string;
        signal: AiAgentTurnSignal;
        rootCause: AiAgentRootCause | null;
        confidence: AiAgentReviewClassifierConfidence;
    }[];
};

type SearchRow = SummaryRow & {
    rank: number;
    rank_cursor: string;
    matched_turn_count: number;
    title_snippet: string | null;
    turn_matches:
        | {
              promptUuid: string;
              createdAt: string;
              prompt: string;
              response: string;
              feedback: string;
              error: string;
          }[]
        | null;
};

const SEARCH_CONFIG = 'lightdash_english_config';
const FIRST_PROMPT_PREVIEW_CHARS = 300;
const MATCHES_PER_THREAD = 3;
// Only the newest matching turns in scope are ranked. Ranking reads each
// turn's stored vector, so this bounds the cost of a search for a common word.
const RANKED_TURN_CANDIDATES = 1_000;
// Must not exceed the caps of the generated `search_vector` columns: text past
// them is not indexed, so a snippet from it could never contain a match.
const HEADLINE_TEXT_CHARS = 20_000;
const HEADLINE_SHORT_TEXT_CHARS = 5_000;
// Control characters cannot occur in the markdown the agent writes, unlike `**`.
const HEADLINE_START = '\u0001';
const HEADLINE_STOP = '\u0002';
const HEADLINE_OPTIONS = `StartSel=${HEADLINE_START}, StopSel=${HEADLINE_STOP}, MaxFragments=2, MaxWords=24, MinWords=8, FragmentDelimiter=" ... "`;

const formatSnippet = (headline: string | null): string | null =>
    headline && headline.includes(HEADLINE_START)
        ? headline
              .replaceAll(HEADLINE_START, '**')
              .replaceAll(HEADLINE_STOP, '**')
        : null;

export class AiAgentThreadHistoryModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    /**
     * Joins and WHERE conditions that restrict `ai_thread t` to the scope.
     * Every query applies them before any ranking or snippet work.
     *
     * `promptExists`: the caller already joins a prompt of the thread, so the
     * "thread has a prompt" check of the admin list is known to hold.
     */
    private static scopedThreads(
        scope: AiAgentThreadHistoryModelScope,
        { promptExists = false }: { promptExists?: boolean } = {},
    ): {
        joins: string;
        where: string;
        bindings: Record<string, unknown>;
    } {
        const isMine = scope.mode === 'mine';
        // The owner comes from the thread's first prompt, so it is only read
        // when a rule needs it. Without it a thread costs no prompt lookup.
        const needsFirstPrompt = isMine || scope.ownerUserUuid !== null;
        const conditions = [
            't.organization_uuid = :organizationUuid',
            't.created_from = ANY(CAST(:createdFrom AS text[]))',
        ];
        if (isMine) {
            conditions.push(
                '(fp.ai_prompt_uuid IS NOT NULL OR t.bound_entity_type IS NOT NULL OR t.thread_context IS NOT NULL)',
            );
        } else if (needsFirstPrompt) {
            conditions.push('fp.ai_prompt_uuid IS NOT NULL');
        } else if (!promptExists) {
            conditions.push(
                'EXISTS (SELECT 1 FROM ai_prompt x WHERE x.ai_thread_uuid = t.ai_thread_uuid)',
            );
        }
        if (scope.projectUuids) {
            conditions.push(
                `${isMine ? 't' : 'a'}.project_uuid = ANY(CAST(:projectUuids AS uuid[]))`,
            );
        }
        if (scope.agentUuids) {
            conditions.push('t.agent_uuid = ANY(CAST(:agentUuids AS uuid[]))');
        }
        if (scope.ownerUserUuid) {
            // The IN list finds the user's threads through an index. It can
            // include a thread someone else started, so the owner rule of
            // the mirrored list query still decides.
            conditions.push(
                `t.ai_thread_uuid IN (
                    SELECT o.ai_thread_uuid FROM ai_prompt o
                    WHERE o.created_by_user_uuid = :ownerUserUuid
                    ${
                        isMine
                            ? `UNION ALL
                    SELECT o.ai_thread_uuid FROM ai_web_app_thread o
                    WHERE o.user_uuid = :ownerUserUuid`
                            : ''
                    }
                )`,
                `${AiAgentThreadHistoryModel.ownerSql(scope.mode)} = :ownerUserUuid`,
            );
        }
        if (scope.dateFrom) conditions.push('t.created_at >= :dateFrom');
        if (scope.dateTo) conditions.push('t.created_at <= :dateTo');
        if (scope.hasError !== undefined) {
            conditions.push(
                `${scope.hasError ? '' : 'NOT '}EXISTS (
                    SELECT 1 FROM ai_prompt e
                    WHERE e.ai_thread_uuid = t.ai_thread_uuid AND e.error_message IS NOT NULL
                )`,
            );
        }
        if (scope.humanScore !== undefined) {
            conditions.push(
                `EXISTS (
                    SELECT 1 FROM ai_prompt h
                    WHERE h.ai_thread_uuid = t.ai_thread_uuid AND h.human_score = :humanScore
                )`,
            );
        }
        if (scope.signal || scope.rootCause) {
            conditions.push(
                `t.ai_thread_uuid IN (
                    SELECT s.ai_thread_uuid FROM ai_agent_review_turn_signal s
                    WHERE s.organization_uuid = :organizationUuid
                    ${scope.signal ? 'AND s.signal = :signal' : ''}
                    ${scope.rootCause ? 'AND s.primary_root_cause = :rootCause' : ''}
                )`,
            );
        }
        return {
            joins: `
                JOIN ai_agent a ON a.ai_agent_uuid = t.agent_uuid
                ${needsFirstPrompt ? AiAgentThreadHistoryModel.firstPromptJoins : ''}
            `,
            where: conditions.join('\n AND '),
            bindings: {
                organizationUuid: scope.organizationUuid,
                createdFrom: scope.createdFrom,
                projectUuids: scope.projectUuids,
                agentUuids: scope.agentUuids,
                ownerUserUuid: scope.ownerUserUuid,
                dateFrom: scope.dateFrom,
                dateTo: scope.dateTo,
                humanScore: scope.humanScore,
                signal: scope.signal,
                rootCause: scope.rootCause,
            },
        };
    }

    /** `fp`: the thread's first prompt. `w`: its web app thread, if any. */
    private static readonly firstPromptJoins = `
        LEFT JOIN LATERAL (
            SELECT p.ai_prompt_uuid, p.created_by_user_uuid
            FROM ai_prompt p
            WHERE p.ai_thread_uuid = t.ai_thread_uuid
            ORDER BY p.created_at ASC
            LIMIT 1
        ) fp ON true
        LEFT JOIN ai_web_app_thread w ON w.ai_thread_uuid = t.ai_thread_uuid
    `;

    /**
     * The project thread list falls back to the web app thread's user when a
     * thread has no prompt yet; the admin list reads the first prompt only.
     */
    private static ownerSql(mode: 'mine' | 'all'): string {
        return mode === 'mine'
            ? 'COALESCE(fp.created_by_user_uuid, w.user_uuid)'
            : 'fp.created_by_user_uuid';
    }

    /**
     * Summary columns and joins for the rows of a `page` relation that has
     * `ai_thread_uuid`. Runs on one page of threads only.
     */
    private static summarySelect(
        mode: 'mine' | 'all',
        includeClassification: boolean,
    ): {
        columns: string;
        joins: string;
        bindings: Record<string, unknown>;
    } {
        return {
            columns: `
                t.ai_thread_uuid, t.project_uuid, t.agent_uuid, a.name AS agent_name,
                t.title, t.created_at, t.created_from,
                to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS created_at_cursor,
                u.user_uuid AS owner_user_uuid,
                COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), 'Unknown user') AS owner_name,
                (
                    SELECT left(p.prompt, ${FIRST_PROMPT_PREVIEW_CHARS}) FROM ai_prompt p
                    WHERE p.ai_prompt_uuid = fp.ai_prompt_uuid
                ) AS first_prompt,
                stats.turn_count, stats.error_count, stats.upvote_count, stats.downvote_count
                ${includeClassification ? ', cls.classified_turn_count, cls.classified_turns' : ''}
            `,
            joins: `
                JOIN ai_thread t ON t.ai_thread_uuid = page.ai_thread_uuid
                JOIN ai_agent a ON a.ai_agent_uuid = t.agent_uuid
                ${AiAgentThreadHistoryModel.firstPromptJoins}
                LEFT JOIN users u ON u.user_uuid = ${AiAgentThreadHistoryModel.ownerSql(mode)}
                LEFT JOIN LATERAL (
                    SELECT count(*)::int AS turn_count,
                           (count(*) FILTER (WHERE p.error_message IS NOT NULL))::int AS error_count,
                           (count(*) FILTER (WHERE p.human_score = 1))::int AS upvote_count,
                           (count(*) FILTER (WHERE p.human_score = -1))::int AS downvote_count
                    FROM ai_prompt p
                    WHERE p.ai_thread_uuid = t.ai_thread_uuid
                ) stats ON true
                ${
                    includeClassification
                        ? `LEFT JOIN LATERAL (
                    SELECT count(*)::int AS classified_turn_count,
                           COALESCE(json_agg(json_build_object(
                               'promptUuid', latest.ai_prompt_uuid,
                               'signal', latest.signal,
                               'rootCause', latest.root_cause,
                               'confidence', latest.confidence
                           ) ORDER BY latest.prompt_created_at), '[]'::json) AS classified_turns
                    FROM (
                        SELECT DISTINCT ON (s.ai_prompt_uuid)
                               s.ai_prompt_uuid, s.signal, s.confidence, p.created_at AS prompt_created_at,
                               CASE WHEN s.primary_root_cause = ANY(CAST(:hiddenRootCauses AS text[]))
                                    THEN NULL ELSE s.primary_root_cause END AS root_cause
                        FROM ai_prompt p
                        JOIN ai_agent_review_turn_signal s ON s.ai_prompt_uuid = p.ai_prompt_uuid
                        WHERE p.ai_thread_uuid = t.ai_thread_uuid
                        ORDER BY s.ai_prompt_uuid, s.created_at DESC
                    ) latest
                ) cls ON true`
                        : ''
                }
            `,
            bindings: {
                hiddenRootCauses: [...HIDDEN_AI_AGENT_REVIEW_ROOT_CAUSES],
            },
        };
    }

    private static mapClassification(
        row: SummaryRow,
        includeClassification: boolean,
    ): AiAgentThreadHistoryClassification | null {
        if (!includeClassification) return null;
        if (!row.classified_turn_count) return { status: 'not_classified' };
        return { status: 'classified', turns: row.classified_turns ?? [] };
    }

    private static mapSummary(
        row: SummaryRow,
        includeClassification: boolean,
    ): AiAgentThreadHistorySummary {
        return {
            threadUuid: row.ai_thread_uuid,
            projectUuid: row.project_uuid,
            agentUuid: row.agent_uuid,
            agentName: row.agent_name,
            title: row.title,
            createdAt: row.created_at.toISOString(),
            createdFrom: row.created_from,
            user: row.owner_user_uuid
                ? { uuid: row.owner_user_uuid, name: row.owner_name }
                : null,
            firstPrompt: row.first_prompt,
            turnCount: row.turn_count,
            errorCount: row.error_count,
            upvoteCount: row.upvote_count,
            downvoteCount: row.downvote_count,
            classification: AiAgentThreadHistoryModel.mapClassification(
                row,
                includeClassification,
            ),
        };
    }

    /** Newest first, keyset-paginated on (created_at, ai_thread_uuid). */
    async listThreads({
        scope,
        cursor,
        limit,
    }: {
        scope: AiAgentThreadHistoryModelScope;
        cursor: { createdAt: string; threadUuid: string } | null;
        limit: number;
    }): Promise<{
        threads: AiAgentThreadHistorySummary[];
        nextCursor: { createdAt: string; threadUuid: string } | null;
    }> {
        const scoped = AiAgentThreadHistoryModel.scopedThreads(scope);
        const summary = AiAgentThreadHistoryModel.summarySelect(
            scope.mode,
            scope.includeClassification,
        );
        const { rows } = await this.database.raw<{ rows: SummaryRow[] }>(
            `
            WITH page AS (
                SELECT t.ai_thread_uuid, t.created_at
                FROM ai_thread t
                ${scoped.joins}
                WHERE ${scoped.where}
                ${
                    cursor
                        ? 'AND (t.created_at, t.ai_thread_uuid) < (CAST(:cursorCreatedAt AS timestamp), CAST(:cursorThreadUuid AS uuid))'
                        : ''
                }
                ORDER BY t.created_at DESC, t.ai_thread_uuid DESC
                LIMIT :limit
            )
            SELECT ${summary.columns}
            FROM page
            ${summary.joins}
            ORDER BY page.created_at DESC, page.ai_thread_uuid DESC
            `,
            {
                ...scoped.bindings,
                ...summary.bindings,
                cursorCreatedAt: cursor?.createdAt,
                cursorThreadUuid: cursor?.threadUuid,
                limit: limit + 1,
            },
        );
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
            threads: page.map((row) =>
                AiAgentThreadHistoryModel.mapSummary(
                    row,
                    scope.includeClassification,
                ),
            ),
            nextCursor:
                rows.length > limit && last
                    ? {
                          createdAt: last.created_at_cursor,
                          threadUuid: last.ai_thread_uuid,
                      }
                    : null,
        };
    }

    /**
     * Full-text search over turns (prompt, response, feedback, error) and
     * thread titles. Scope filters apply inside both match branches, matches
     * are ranked and grouped to threads, and snippets are built for the
     * returned page only. Keyset-paginated on (rank, ai_thread_uuid).
     */
    async searchThreads({
        scope,
        query,
        cursor,
        limit,
    }: {
        scope: AiAgentThreadHistoryModelScope;
        query: string;
        cursor: { rank: string; threadUuid: string } | null;
        limit: number;
    }): Promise<{
        threads: AiAgentThreadHistorySearchResult[];
        nextCursor: { rank: string; threadUuid: string } | null;
    }> {
        const scoped = AiAgentThreadHistoryModel.scopedThreads(scope);
        const scopedTurns = AiAgentThreadHistoryModel.scopedThreads(scope, {
            promptExists: true,
        });
        const summary = AiAgentThreadHistoryModel.summarySelect(
            scope.mode,
            scope.includeClassification,
        );
        const tsQuery = `websearch_to_tsquery('${SEARCH_CONFIG}', :query)`;
        const headline = (text: string) =>
            `ts_headline('${SEARCH_CONFIG}', ${text}, ${tsQuery}, :headlineOptions)`;
        const sql = `
            WITH hits AS MATERIALIZED (
                -- Index-only step: the organization lexeme keeps the GIN scan
                -- to this organization's turns, and no row's vector is read.
                SELECT p.ai_prompt_uuid, p.ai_thread_uuid, p.created_at
                FROM ai_prompt p
                WHERE p.search_vector @@ (${tsQuery} && to_tsquery('simple', :organizationLexeme))
                  AND numnode(${tsQuery}) > 0
            ),
            candidates AS (
                -- Scope first, then keep the newest matching turns to rank.
                SELECT hits.ai_prompt_uuid, hits.ai_thread_uuid
                FROM hits
                JOIN ai_thread t ON t.ai_thread_uuid = hits.ai_thread_uuid
                ${scopedTurns.joins}
                WHERE ${scopedTurns.where}
                ORDER BY hits.created_at DESC
                LIMIT ${RANKED_TURN_CANDIDATES}
            ),
            matches AS (
                SELECT c.ai_thread_uuid, 1 AS turn,
                       ts_rank_cd(p.search_vector, ${tsQuery}) AS rank
                FROM candidates c
                JOIN ai_prompt p ON p.ai_prompt_uuid = c.ai_prompt_uuid
                UNION ALL
                SELECT t.ai_thread_uuid, 0 AS turn,
                       ts_rank_cd(t.search_vector, ${tsQuery}) AS rank
                FROM ai_thread t
                ${scoped.joins}
                WHERE t.search_vector @@ ${tsQuery}
                  AND ${scoped.where}
            ),
            ranked AS (
                SELECT ai_thread_uuid,
                       (COALESCE(max(rank) FILTER (WHERE turn = 1), 0)
                        + COALESCE(max(rank) FILTER (WHERE turn = 0), 0))::float4 AS rank,
                       sum(turn)::int AS matched_turn_count
                FROM matches
                GROUP BY ai_thread_uuid
            ),
            page AS (
                SELECT * FROM ranked
                ${
                    cursor
                        ? 'WHERE (rank, ai_thread_uuid) < (CAST(:cursorRank AS float4), CAST(:cursorThreadUuid AS uuid))'
                        : ''
                }
                ORDER BY rank DESC, ai_thread_uuid DESC
                LIMIT :limit
            )
            SELECT ${summary.columns},
                   page.rank, page.rank::text AS rank_cursor, page.matched_turn_count,
                   CASE WHEN t.search_vector @@ ${tsQuery}
                        THEN ${headline("coalesce(t.title, '')")} END AS title_snippet,
                   hl.turn_matches
            FROM page
            ${summary.joins}
            LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                    'promptUuid', best.ai_prompt_uuid,
                    'createdAt', best.created_at,
                    'prompt', ${headline(`left(best.prompt, ${HEADLINE_TEXT_CHARS})`)},
                    'response', ${headline(`left(coalesce(best.response, ''), ${HEADLINE_TEXT_CHARS})`)},
                    'feedback', ${headline(`left(coalesce(best.human_feedback, ''), ${HEADLINE_SHORT_TEXT_CHARS})`)},
                    'error', ${headline(`left(coalesce(best.error_message, ''), ${HEADLINE_SHORT_TEXT_CHARS})`)}
                ) ORDER BY best.rank DESC, best.created_at) AS turn_matches
                FROM (
                    SELECT p.ai_prompt_uuid, p.created_at, p.prompt, p.response,
                           p.human_feedback, p.error_message,
                           ts_rank_cd(p.search_vector, ${tsQuery}) AS rank
                    FROM ai_prompt p
                    WHERE p.ai_thread_uuid = t.ai_thread_uuid
                      AND p.search_vector @@ ${tsQuery}
                    ORDER BY rank DESC, p.created_at
                    LIMIT ${MATCHES_PER_THREAD}
                ) best
            ) hl ON true
            ORDER BY page.rank DESC, page.ai_thread_uuid DESC
        `;
        const bindings = {
            ...scoped.bindings,
            ...summary.bindings,
            query,
            organizationLexeme: `org${scope.organizationUuid.replaceAll('-', '')}`,
            headlineOptions: HEADLINE_OPTIONS,
            cursorRank: cursor?.rank,
            cursorThreadUuid: cursor?.threadUuid,
            limit: limit + 1,
        };
        const { rows } = await this.database.transaction(async (trx) => {
            // The planner prices a tsvector match like a cheap comparison, so
            // for a common word it prefers scanning every ai_prompt row and
            // reading each stored vector (seconds) over the GIN index.
            await trx.raw('SET LOCAL enable_seqscan = off');
            await trx.raw("SET LOCAL statement_timeout = '15s'");
            return trx.raw<{ rows: SearchRow[] }>(sql, bindings);
        });
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
            threads: page.map((row) => ({
                ...AiAgentThreadHistoryModel.mapSummary(
                    row,
                    scope.includeClassification,
                ),
                rank: row.rank,
                matchedTurnCount: row.matched_turn_count,
                matches: AiAgentThreadHistoryModel.mapMatches(row),
            })),
            nextCursor:
                rows.length > limit && last
                    ? {
                          rank: last.rank_cursor,
                          threadUuid: last.ai_thread_uuid,
                      }
                    : null,
        };
    }

    private static mapMatches(
        row: SearchRow,
    ): AiAgentThreadHistorySearchMatch[] {
        const matches: AiAgentThreadHistorySearchMatch[] = [];
        const titleSnippet = formatSnippet(row.title_snippet);
        if (titleSnippet) {
            matches.push({
                promptUuid: null,
                createdAt: null,
                matchedIn: ['title'],
                snippet: titleSnippet,
            });
        }
        (row.turn_matches ?? []).forEach((turn) => {
            const fields = (
                ['prompt', 'response', 'feedback', 'error'] as const
            )
                .map((field) => ({
                    field,
                    snippet: formatSnippet(turn[field]),
                }))
                .filter(
                    (
                        entry,
                    ): entry is {
                        field: (typeof entry)['field'];
                        snippet: string;
                    } => entry.snippet !== null,
                );
            if (fields.length === 0) return;
            matches.push({
                promptUuid: turn.promptUuid,
                createdAt: new Date(`${turn.createdAt}Z`).toISOString(),
                matchedIn: fields.map(({ field }) => field),
                snippet: fields[0].snippet,
            });
        });
        return matches;
    }

    /**
     * One thread's summary, for a caller the service has already authorized.
     * Returns undefined when the thread is not in the organization.
     */
    async findThreadSummary({
        organizationUuid,
        threadUuid,
        includeClassification,
    }: {
        organizationUuid: string;
        threadUuid: string;
        includeClassification: boolean;
    }): Promise<AiAgentThreadHistorySummary | undefined> {
        // Owner as the single-thread GET resolves it.
        const summary = AiAgentThreadHistoryModel.summarySelect(
            'mine',
            includeClassification,
        );
        const { rows } = await this.database.raw<{ rows: SummaryRow[] }>(
            `
            WITH page AS (
                SELECT x.ai_thread_uuid
                FROM ai_thread x
                WHERE x.ai_thread_uuid = :threadUuid
                  AND x.organization_uuid = :organizationUuid
            )
            SELECT ${summary.columns}
            FROM page
            ${summary.joins}
            `,
            { ...summary.bindings, organizationUuid, threadUuid },
        );
        return rows[0]
            ? AiAgentThreadHistoryModel.mapSummary(
                  rows[0],
                  includeClassification,
              )
            : undefined;
    }

    /**
     * A page of a thread's turns, oldest first. Text is cut in the database so
     * a very long prompt or response is never loaded whole.
     */
    async findThreadTurns({
        threadUuid,
        offset,
        limit,
        maxTextChars,
    }: {
        threadUuid: string;
        offset: number;
        limit: number;
        maxTextChars: number;
    }): Promise<AiAgentThreadHistoryTurnRow[]> {
        const { rows } = await this.database.raw<{
            rows: AiAgentThreadHistoryTurnRow[];
        }>(
            `
            SELECT p.ai_prompt_uuid AS "promptUuid",
                   p.created_at AS "createdAt",
                   left(p.prompt, :maxTextChars) AS prompt,
                   char_length(p.prompt) AS "promptLength",
                   left(p.response, :maxTextChars) AS response,
                   char_length(p.response) AS "responseLength",
                   left(p.error_message, :maxTextChars) AS "errorMessage",
                   p.human_score AS "humanScore",
                   left(p.human_feedback, :maxTextChars) AS "humanFeedback"
            FROM ai_prompt p
            WHERE p.ai_thread_uuid = :threadUuid
            ORDER BY p.created_at ASC, p.ai_prompt_uuid ASC
            LIMIT :limit OFFSET :offset
            `,
            { threadUuid, offset, limit, maxTextChars },
        );
        return rows;
    }

    /** Latest review classifier result per turn; turns without one are absent. */
    async findTurnClassifications(
        promptUuids: string[],
    ): Promise<
        Map<
            string,
            Extract<
                AiAgentThreadHistoryClassification,
                { status: 'classified' }
            >['turns'][number]
        >
    > {
        if (promptUuids.length === 0) return new Map();
        const { rows } = await this.database.raw<{
            rows: {
                promptUuid: string;
                signal: AiAgentTurnSignal;
                rootCause: AiAgentRootCause | null;
                confidence: AiAgentReviewClassifierConfidence;
            }[];
        }>(
            `
            SELECT DISTINCT ON (s.ai_prompt_uuid)
                   s.ai_prompt_uuid AS "promptUuid", s.signal, s.confidence,
                   CASE WHEN s.primary_root_cause = ANY(CAST(:hiddenRootCauses AS text[]))
                        THEN NULL ELSE s.primary_root_cause END AS "rootCause"
            FROM ai_agent_review_turn_signal s
            WHERE s.ai_prompt_uuid = ANY(CAST(:promptUuids AS uuid[]))
            ORDER BY s.ai_prompt_uuid, s.created_at DESC
            `,
            {
                promptUuids,
                hiddenRootCauses: [...HIDDEN_AI_AGENT_REVIEW_ROOT_CAUSES],
            },
        );
        return new Map(rows.map((row) => [row.promptUuid, row]));
    }

    async findTurnToolCalls(
        promptUuids: string[],
    ): Promise<AiAgentThreadHistoryToolCallRow[]> {
        if (promptUuids.length === 0) return [];
        const { rows } = await this.database.raw<{
            rows: AiAgentThreadHistoryToolCallRow[];
        }>(
            `
            SELECT tool_call.ai_prompt_uuid AS "promptUuid",
                   tool_call.tool_call_id AS "toolCallId",
                   tool_call.tool_name AS name,
                   tool_call.tool_args AS args,
                   tool_result.result,
                   COALESCE(tool_result.metadata->>'status' = 'error', false) AS "isError",
                   CASE WHEN tool_call.ai_mcp_server_uuid IS NOT NULL
                        THEN 'mcp' ELSE 'lightdash' END AS source
            FROM ai_agent_tool_call tool_call
            LEFT JOIN ai_agent_tool_result tool_result
                   ON tool_result.tool_call_id = tool_call.tool_call_id
                  AND tool_result.ai_prompt_uuid = tool_call.ai_prompt_uuid
            WHERE tool_call.ai_prompt_uuid = ANY(CAST(:promptUuids AS uuid[]))
            ORDER BY tool_call.created_at ASC
            `,
            { promptUuids },
        );
        return rows;
    }
}
