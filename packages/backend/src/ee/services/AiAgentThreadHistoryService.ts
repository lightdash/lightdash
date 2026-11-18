import {
    AI_USER_THREAD_CREATED_FROM,
    ForbiddenError,
    isHiddenAiAgentReviewRootCause,
    NotFoundError,
    ParameterError,
    type AiAgentThreadHistoryClassification,
    type AiAgentThreadHistoryFilters,
    type AiAgentThreadHistoryList,
    type AiAgentThreadHistoryScope,
    type AiAgentThreadHistorySearchResults,
    type AiAgentThreadHistoryToolCall,
    type AiAgentThreadHistoryTranscript,
    type AiAgentThreadHistoryTurn,
    type AiThreadCreatedFrom,
    type SessionUser,
} from '@lightdash/common';
import { type GroupsModel } from '../../models/GroupsModel';
import { BaseService } from '../../services/BaseService';
import { type AiAgentModel } from '../models/AiAgentModel';
import {
    type AiAgentThreadHistoryModel,
    type AiAgentThreadHistoryModelScope,
} from '../models/AiAgentThreadHistoryModel';
import { sanitizeToolResultForDump } from './ai/utils/threadDumpSanitizer';
import { AiAgentAdminService } from './AiAgentAdminService';
import { canAccessAiAgentThread } from './AiAgentService/aiAgentAccess';
import { type AiAgentService } from './AiAgentService/AiAgentService';

type Dependencies = {
    aiAgentThreadHistoryModel: AiAgentThreadHistoryModel;
    aiAgentModel: Pick<AiAgentModel, 'findThreadOwnership' | 'getAgent'>;
    aiAgentService: Pick<AiAgentService, 'listAgents' | 'getIsCopilotEnabled'>;
    aiAgentAdminService: Pick<AiAgentAdminService, 'resolveReadScope'>;
    groupsModel: Pick<GroupsModel, 'findUserInGroups'>;
};

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;
const MAX_SEARCH_QUERY_CHARS = 500;
const DEFAULT_TURN_LIMIT = 10;
const MAX_TURN_LIMIT = 50;
// Same bounds as the readPinnedThread agent tool.
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TRANSCRIPT_CHARS = 40_000;
const MAX_TOOL_TEXT_CHARS = 2_000;

const encodeCursor = (cursor: object): string =>
    Buffer.from(JSON.stringify(cursor)).toString('base64url');

const decodeCursor = <T extends Record<string, string>>(
    cursor: string | undefined,
    keys: (keyof T)[],
): T | null => {
    if (!cursor) return null;
    try {
        const parsed: unknown = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8'),
        );
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            keys.every(
                (key) =>
                    typeof (parsed as Record<string, unknown>)[
                        key as string
                    ] === 'string',
            )
        ) {
            return parsed as T;
        }
    } catch {
        // fall through
    }
    throw new ParameterError('Invalid cursor');
};

const clampLimit = (
    limit: number | undefined,
    fallback: number,
    max: number,
): number => {
    if (limit === undefined) return fallback;
    if (!Number.isInteger(limit) || limit < 1) {
        throw new ParameterError('limit must be a positive integer');
    }
    return Math.min(limit, max);
};

/** Cuts text to a per-item cap and to what is left of a shared total. */
const createCharBudget = (total: number) => {
    let remaining = total;
    return {
        isSpent: () => remaining <= 0,
        take: <T extends string | null>(
            text: T,
            maxChars: number,
        ): { text: T; cut: boolean } => {
            if (text === null) return { text, cut: false };
            const taken = text.slice(
                0,
                Math.max(0, Math.min(maxChars, remaining)),
            );
            remaining -= taken.length;
            return { text: taken as T, cut: taken.length < text.length };
        },
    };
};

type TurnClassification = Extract<
    AiAgentThreadHistoryClassification,
    { status: 'classified' }
>['turns'][number];

const toClassification = (
    classifications: Map<string, TurnClassification> | null,
    turnClassification: TurnClassification | undefined,
): AiAgentThreadHistoryClassification | null => {
    if (!classifications) return null;
    return turnClassification
        ? { status: 'classified', turns: [turnClassification] }
        : { status: 'not_classified' };
};

/**
 * Lists, searches and reads AI agent threads for the REST API, the MCP tools
 * and the agent's own tools. It adds no permission rules of its own:
 *
 * - `mine` scope is the project thread list (`AiAgentService.listProjectThreads`):
 *   copilot enabled, agents from `listAgents`, the caller's own threads.
 * - `all` scope is the AI admin thread list (`AiAgentAdminService.getAllThreads`):
 *   projects from `resolveReadScope`.
 * - Reading one thread is the single-thread GET (`AiAgentService.getAgentThread`).
 * - Review classifier results follow the review signals endpoint
 *   (`AiAgentAdminService.listReviewSignals`): organization AI admins only.
 */
export class AiAgentThreadHistoryService extends BaseService {
    private readonly aiAgentThreadHistoryModel: Dependencies['aiAgentThreadHistoryModel'];

    private readonly aiAgentModel: Dependencies['aiAgentModel'];

    private readonly aiAgentService: Dependencies['aiAgentService'];

    private readonly aiAgentAdminService: Dependencies['aiAgentAdminService'];

    private readonly groupsModel: Dependencies['groupsModel'];

    constructor(dependencies: Dependencies) {
        super();
        this.aiAgentThreadHistoryModel = dependencies.aiAgentThreadHistoryModel;
        this.aiAgentModel = dependencies.aiAgentModel;
        this.aiAgentService = dependencies.aiAgentService;
        this.aiAgentAdminService = dependencies.aiAgentAdminService;
        this.groupsModel = dependencies.groupsModel;
    }

    /** Null: the caller can see no thread, so the result is empty. */
    private async resolveScope(
        user: SessionUser,
        scope: AiAgentThreadHistoryScope,
        filters: AiAgentThreadHistoryFilters,
    ): Promise<AiAgentThreadHistoryModelScope | null> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        const common = {
            organizationUuid,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            hasError: filters.hasError,
            humanScore: filters.humanScore,
        };

        if (scope === 'mine') {
            if (
                filters.signal !== undefined ||
                filters.rootCause !== undefined
            ) {
                throw new ForbiddenError(
                    'Review classifier filters are only available in the "all" scope',
                );
            }
            if (
                filters.userUuid !== undefined &&
                filters.userUuid !== user.userUuid
            ) {
                throw new ForbiddenError(
                    'Filtering by another user is only available in the "all" scope',
                );
            }
            if (!filters.projectUuid) {
                throw new ParameterError(
                    'projectUuid is required in the "mine" scope',
                );
            }
            // Throws when copilot is disabled for the caller.
            const accessibleAgentUuids = (
                await this.aiAgentService.listAgents(user, filters.projectUuid)
            ).map((agent) => agent.uuid);
            if (
                filters.agentUuid &&
                !accessibleAgentUuids.includes(filters.agentUuid)
            ) {
                throw new ForbiddenError(
                    'Insufficient permissions to access this agent',
                );
            }
            if (accessibleAgentUuids.length === 0) return null;
            return {
                ...common,
                mode: 'mine',
                projectUuids: [filters.projectUuid],
                agentUuids: filters.agentUuid
                    ? [filters.agentUuid]
                    : accessibleAgentUuids,
                ownerUserUuid: user.userUuid,
                createdFrom: filters.createdFrom
                    ? [filters.createdFrom]
                    : [...AI_USER_THREAD_CREATED_FROM],
                includeClassification: false,
            };
        }

        // Throws when the caller administers no project.
        const readScope = await this.aiAgentAdminService.resolveReadScope(
            user,
            organizationUuid,
        );
        const { filters: scoped, empty } =
            AiAgentAdminService.restrictFiltersToScope(
                readScope,
                filters.projectUuid
                    ? { projectUuids: [filters.projectUuid] }
                    : undefined,
            );
        if (empty) return null;

        const canReadClassification = readScope.kind === 'all';
        if (
            (filters.signal !== undefined || filters.rootCause !== undefined) &&
            !canReadClassification
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access AI agent reviews',
            );
        }
        // Hidden root causes are never surfaced, so nothing can match them.
        if (
            filters.rootCause &&
            isHiddenAiAgentReviewRootCause(filters.rootCause)
        ) {
            return null;
        }
        // The admin list only ever holds threads started by a person.
        const userCreatedFrom: readonly AiThreadCreatedFrom[] =
            AI_USER_THREAD_CREATED_FROM;
        if (
            filters.createdFrom &&
            !userCreatedFrom.includes(filters.createdFrom)
        ) {
            return null;
        }
        return {
            ...common,
            mode: 'all',
            projectUuids: scoped?.projectUuids ?? null,
            agentUuids: filters.agentUuid ? [filters.agentUuid] : null,
            ownerUserUuid: filters.userUuid ?? null,
            createdFrom: filters.createdFrom
                ? [filters.createdFrom]
                : [...userCreatedFrom],
            signal: filters.signal,
            rootCause: filters.rootCause,
            includeClassification: canReadClassification,
        };
    }

    async listThreads(
        user: SessionUser,
        {
            scope,
            filters = {},
            cursor,
            limit,
        }: {
            scope: AiAgentThreadHistoryScope;
            filters?: AiAgentThreadHistoryFilters;
            cursor?: string;
            limit?: number;
        },
    ): Promise<AiAgentThreadHistoryList> {
        const pageSize = clampLimit(limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
        const decodedCursor = decodeCursor<{
            createdAt: string;
            threadUuid: string;
        }>(cursor, ['createdAt', 'threadUuid']);
        const modelScope = await this.resolveScope(user, scope, filters);
        if (!modelScope) return { threads: [], nextCursor: null };

        const { threads, nextCursor } =
            await this.aiAgentThreadHistoryModel.listThreads({
                scope: modelScope,
                cursor: decodedCursor,
                limit: pageSize,
            });
        return {
            threads,
            nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
        };
    }

    async searchThreads(
        user: SessionUser,
        {
            scope,
            query,
            filters = {},
            cursor,
            limit,
        }: {
            scope: AiAgentThreadHistoryScope;
            query: string;
            filters?: AiAgentThreadHistoryFilters;
            cursor?: string;
            limit?: number;
        },
    ): Promise<AiAgentThreadHistorySearchResults> {
        const trimmedQuery = query.trim();
        if (trimmedQuery.length === 0) {
            throw new ParameterError('query must not be empty');
        }
        if (trimmedQuery.length > MAX_SEARCH_QUERY_CHARS) {
            throw new ParameterError(
                `query must be at most ${MAX_SEARCH_QUERY_CHARS} characters`,
            );
        }
        const pageSize = clampLimit(
            limit,
            DEFAULT_SEARCH_LIMIT,
            MAX_SEARCH_LIMIT,
        );
        const decodedCursor = decodeCursor<{
            rank: string;
            threadUuid: string;
        }>(cursor, ['rank', 'threadUuid']);
        const modelScope = await this.resolveScope(user, scope, filters);
        if (!modelScope) return { threads: [], nextCursor: null };

        const { threads, nextCursor } =
            await this.aiAgentThreadHistoryModel.searchThreads({
                scope: modelScope,
                query: trimmedQuery,
                cursor: decodedCursor,
                limit: pageSize,
            });
        return {
            threads,
            nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
        };
    }

    /** Review classifier results are readable by organization AI admins only. */
    private async canReadClassification(
        user: SessionUser,
        organizationUuid: string,
    ): Promise<boolean> {
        try {
            const readScope = await this.aiAgentAdminService.resolveReadScope(
                user,
                organizationUuid,
            );
            return readScope.kind === 'all';
        } catch (error) {
            if (error instanceof ForbiddenError) return false;
            throw error;
        }
    }

    /**
     * A bounded transcript of one thread, paged by turn. Authorized exactly
     * like `AiAgentService.getAgentThread`.
     */
    async getThread(
        user: SessionUser,
        threadUuid: string,
        {
            turnOffset = 0,
            turnLimit,
            includeToolCalls = false,
            within,
        }: {
            turnOffset?: number;
            turnLimit?: number;
            includeToolCalls?: boolean;
            /**
             * Narrows the caller's view to one project or agent, for a
             * session that is pinned to it. A thread outside it reads as
             * not found.
             */
            within?: { projectUuid?: string; agentUuid?: string };
        } = {},
    ): Promise<AiAgentThreadHistoryTranscript> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        if (!Number.isInteger(turnOffset) || turnOffset < 0) {
            throw new ParameterError(
                'turnOffset must be a non-negative integer',
            );
        }
        const pageSize = clampLimit(
            turnLimit,
            DEFAULT_TURN_LIMIT,
            MAX_TURN_LIMIT,
        );

        if (!(await this.aiAgentService.getIsCopilotEnabled(user))) {
            throw new ForbiddenError('Copilot is not enabled');
        }
        const ownership = await this.aiAgentModel.findThreadOwnership({
            organizationUuid,
            threadUuid,
        });
        if (
            !ownership?.agentUuid ||
            (within?.projectUuid &&
                within.projectUuid !== ownership.projectUuid) ||
            (within?.agentUuid && within.agentUuid !== ownership.agentUuid)
        ) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }
        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid: ownership.agentUuid,
        });
        if (!agent) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }
        const hasAccess = await canAccessAiAgentThread(
            user,
            agent,
            ownership.ownerUserUuid ?? '',
            {
                auditedAbility: this.createAuditedAbility(user),
                groupsModel: this.groupsModel,
            },
        );
        if (!hasAccess) {
            throw new ForbiddenError(
                'Insufficient permissions to view this thread',
            );
        }

        const includeClassification = await this.canReadClassification(
            user,
            organizationUuid,
        );
        const [thread, turnRows] = await Promise.all([
            this.aiAgentThreadHistoryModel.findThreadSummary({
                organizationUuid,
                threadUuid,
                includeClassification,
            }),
            this.aiAgentThreadHistoryModel.findThreadTurns({
                threadUuid,
                offset: turnOffset,
                limit: pageSize,
                maxTextChars: MAX_MESSAGE_CHARS,
            }),
        ]);
        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }
        const promptUuids = turnRows.map((row) => row.promptUuid);
        const [classifications, toolCallRows] = await Promise.all([
            includeClassification
                ? this.aiAgentThreadHistoryModel.findTurnClassifications(
                      promptUuids,
                  )
                : null,
            includeToolCalls
                ? this.aiAgentThreadHistoryModel.findTurnToolCalls(promptUuids)
                : [],
        ]);

        // Query rows and field values never leave through here.
        const sanitizedToolCalls = await Promise.all(
            toolCallRows.map(async (toolCall) => ({
                toolCall,
                sanitized: await sanitizeToolResultForDump(toolCall),
            })),
        );

        const budget = createCharBudget(MAX_TRANSCRIPT_CHARS);
        const turns: AiAgentThreadHistoryTurn[] = [];
        // Sequential on purpose: each turn spends from one shared budget.
        // eslint-disable-next-line no-restricted-syntax
        for (const [position, row] of turnRows.entries()) {
            // Stop at a turn boundary so the next page starts on a whole turn.
            if (budget.isSpent() && turns.length > 0) break;

            const prompt = budget.take(row.prompt, MAX_MESSAGE_CHARS);
            const response = budget.take(row.response, MAX_MESSAGE_CHARS);
            const errorMessage = budget.take(
                row.errorMessage,
                MAX_MESSAGE_CHARS,
            );
            const humanFeedback = budget.take(
                row.humanFeedback,
                MAX_MESSAGE_CHARS,
            );
            const toolCalls = sanitizedToolCalls
                .filter(
                    ({ toolCall }) => toolCall.promptUuid === row.promptUuid,
                )
                .map(({ toolCall, sanitized }) => ({
                    toolCall,
                    sanitized,
                    args: budget.take(
                        JSON.stringify(toolCall.args ?? null),
                        MAX_TOOL_TEXT_CHARS,
                    ),
                    result: budget.take(sanitized.result, MAX_TOOL_TEXT_CHARS),
                }));

            const turnClassification = classifications?.get(row.promptUuid);
            turns.push({
                index: turnOffset + position,
                promptUuid: row.promptUuid,
                createdAt: row.createdAt.toISOString(),
                prompt: prompt.text ?? '',
                response: response.text,
                errorMessage: errorMessage.text,
                humanScore: row.humanScore,
                humanFeedback: humanFeedback.text,
                truncated:
                    row.promptLength > row.prompt.length ||
                    (row.responseLength ?? 0) > (row.response?.length ?? 0) ||
                    [prompt, response, errorMessage, humanFeedback].some(
                        ({ cut }) => cut,
                    ) ||
                    toolCalls.some(
                        ({ args, result }) => args.cut || result.cut,
                    ),
                classification: toClassification(
                    classifications,
                    turnClassification,
                ),
                ...(includeToolCalls
                    ? {
                          toolCalls: toolCalls.map(
                              ({
                                  toolCall,
                                  sanitized,
                                  args,
                                  result,
                              }): AiAgentThreadHistoryToolCall => ({
                                  toolCallId: toolCall.toolCallId,
                                  name: toolCall.name,
                                  args: args.text ?? '',
                                  result: result.text,
                                  resultOmitted: sanitized.resultOmitted,
                                  isError: toolCall.isError,
                              }),
                          ),
                      }
                    : {}),
            });
        }

        const nextTurnOffset = turnOffset + turns.length;
        return {
            thread,
            turns,
            nextTurnOffset:
                turns.length > 0 && nextTurnOffset < thread.turnCount
                    ? nextTurnOffset
                    : null,
        };
    }
}
