import {
    ProjectType,
    type AiProjectContextTypedObjectRef,
    type AiThreadCreatedFrom,
    type UUID,
} from '@lightdash/common';
import { Knex } from 'knex';
import { ProjectTableName } from '../../database/entities/projects';
import {
    AiAgentToolCallTableName,
    AiAgentToolResultTableName,
    AiPromptInterruptTableName,
    AiPromptTableName,
    AiThreadTableName,
} from '../database/entities/ai';
import {
    AiAgentMemoryTableName,
    AiAgentThreadDistillTableName,
    type AiAgentMemoryTable,
    type AiAgentThreadDistillTable,
    type DbAiAgentMemory,
    type DbAiAgentThreadDistill,
} from '../database/entities/aiAgentMemory';

export const AI_AGENT_MEMORY_THREAD_SOURCES = [
    'web_app',
    'slack',
] as const satisfies readonly AiThreadCreatedFrom[];

type SourceThreadMemory = {
    organizationUuid: UUID;
    projectUuid: UUID;
    agentUuid: UUID | null;
    userUuid: UUID | null;
    sourceThreadUuid: UUID;
    slug: string;
    title: string;
    rawMemory: string;
    threadSummary: string;
    terms: string[];
    objects: AiProjectContextTypedObjectRef[];
    unresolvedObjects: AiProjectContextTypedObjectRef[];
    generatedAt: Date;
};

type ThreadDistillResult = {
    aiThreadUuid: UUID;
    distillPromptHash: string | null;
    distilledUpTo: Date;
} & (
    | {
          outcome: 'memory';
          noOpReason?: never;
          errorMessage?: never;
      }
    | {
          outcome: 'no_op';
          noOpReason: string;
          errorMessage?: never;
      }
    | {
          outcome: 'skipped';
          noOpReason?: never;
          errorMessage?: never;
      }
    | {
          outcome: 'failed';
          noOpReason?: never;
          errorMessage: string;
      }
);

export type AiAgentMemoryThreadCandidate = {
    threadUuid: UUID;
    organizationUuid: UUID;
    projectUuid: UUID;
    latestActivity: Date;
};

export type AiAgentMemoryThread = AiAgentMemoryThreadCandidate & {
    distilledUpTo: Date | null;
    agentUuid: UUID | null;
    userUuid: UUID | null;
    title: string | null;
    createdFrom: AiThreadCreatedFrom;
    projectType: ProjectType;
    turns: Array<{
        promptUuid: UUID;
        createdAt: Date;
        userText: string;
        assistantText: string | null;
        errorMessage: string | null;
        respondedAt: Date | null;
        interrupted: boolean;
        tools: Array<{
            toolCallId: string;
            name: string;
            args: unknown;
            result: string | null;
            source: 'lightdash' | 'mcp';
        }>;
    }>;
};

export type AiAgentMemoryLineageSource = Pick<
    DbAiAgentMemory,
    'slug' | 'agent_uuid' | 'source_thread_uuid' | 'thread_summary'
> & {
    thread_title: string | null;
};

export type AiAgentMemoryWithLineage = {
    memory: DbAiAgentMemory;
    sources: AiAgentMemoryLineageSource[];
    replacement: Pick<DbAiAgentMemory, 'slug'> | null;
};

export class AiAgentMemoryModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async findThreadsDueForDistill(args: {
        idleBefore: Date;
        activityFloor: Date;
    }): Promise<AiAgentMemoryThreadCandidate[]> {
        const rows = await this.database(`${AiThreadTableName} as thread`)
            .join(
                `${ProjectTableName} as project`,
                'project.project_uuid',
                'thread.project_uuid',
            )
            .leftJoin(
                `${AiAgentThreadDistillTableName} as distill`,
                'distill.ai_thread_uuid',
                'thread.ai_thread_uuid',
            )
            .whereIn('thread.created_from', AI_AGENT_MEMORY_THREAD_SOURCES)
            .whereNot('project.project_type', ProjectType.PREVIEW)
            .whereBetween('thread.updated_at', [
                args.activityFloor,
                args.idleBefore,
            ])
            .where((query) => {
                void query
                    .whereNull('distill.ai_thread_uuid')
                    .orWhereRaw('distill.distilled_up_to < thread.updated_at');
            })
            .select<AiAgentMemoryThreadCandidate[]>({
                threadUuid: 'thread.ai_thread_uuid',
                organizationUuid: 'thread.organization_uuid',
                projectUuid: 'thread.project_uuid',
                latestActivity: 'thread.updated_at',
            });

        return rows;
    }

    async findThreadForDistill(
        threadUuid: UUID,
    ): Promise<AiAgentMemoryThread | undefined> {
        const promptRows = await this.database(`${AiThreadTableName} as thread`)
            .join(
                `${ProjectTableName} as project`,
                'project.project_uuid',
                'thread.project_uuid',
            )
            .leftJoin(
                `${AiAgentThreadDistillTableName} as distill`,
                'distill.ai_thread_uuid',
                'thread.ai_thread_uuid',
            )
            .join(
                `${AiPromptTableName} as prompt`,
                'prompt.ai_thread_uuid',
                'thread.ai_thread_uuid',
            )
            .leftJoin(
                `${AiPromptInterruptTableName} as prompt_interrupt`,
                'prompt_interrupt.ai_prompt_uuid',
                'prompt.ai_prompt_uuid',
            )
            .where('thread.ai_thread_uuid', threadUuid)
            .whereIn('thread.created_from', AI_AGENT_MEMORY_THREAD_SOURCES)
            .whereNot('project.project_type', ProjectType.PREVIEW)
            .whereNotNull('thread.updated_at')
            .orderBy('prompt.created_at', 'asc')
            .select<
                Array<{
                    threadUuid: UUID;
                    organizationUuid: UUID;
                    projectUuid: UUID;
                    agentUuid: UUID | null;
                    title: string | null;
                    createdFrom: AiThreadCreatedFrom;
                    projectType: ProjectType;
                    latestActivity: Date;
                    distilledUpTo: Date | null;
                    promptUuid: UUID;
                    createdAt: Date;
                    userUuid: UUID | null;
                    userText: string;
                    assistantText: string | null;
                    errorMessage: string | null;
                    respondedAt: Date | null;
                    interruptUuid: UUID | null;
                    hidden: boolean;
                }>
            >({
                threadUuid: 'thread.ai_thread_uuid',
                organizationUuid: 'thread.organization_uuid',
                projectUuid: 'thread.project_uuid',
                agentUuid: 'thread.agent_uuid',
                title: 'thread.title',
                createdFrom: 'thread.created_from',
                projectType: 'project.project_type',
                latestActivity: 'thread.updated_at',
                distilledUpTo: 'distill.distilled_up_to',
                promptUuid: 'prompt.ai_prompt_uuid',
                createdAt: 'prompt.created_at',
                userUuid: 'prompt.created_by_user_uuid',
                userText: 'prompt.prompt',
                assistantText: 'prompt.response',
                errorMessage: 'prompt.error_message',
                respondedAt: 'prompt.responded_at',
                interruptUuid: 'prompt_interrupt.ai_prompt_uuid',
                hidden: 'prompt.hidden',
            });

        const first = promptRows[0];
        if (!first) return undefined;
        const visiblePromptRows = promptRows.filter((row) => !row.hidden);

        type ToolRow = {
            promptUuid: string;
            toolCallId: string;
            name: string;
            args: unknown;
            result: string | null;
            mcpServerUuid: string | null;
        };
        const toolRows = await this.database(
            `${AiAgentToolCallTableName} as tool_call`,
        )
            .join(
                `${AiPromptTableName} as prompt`,
                'prompt.ai_prompt_uuid',
                'tool_call.ai_prompt_uuid',
            )
            .leftJoin(
                `${AiAgentToolResultTableName} as tool_result`,
                function joinToolResult() {
                    this.on(
                        'tool_result.tool_call_id',
                        '=',
                        'tool_call.tool_call_id',
                    ).andOn(
                        'tool_result.ai_prompt_uuid',
                        '=',
                        'tool_call.ai_prompt_uuid',
                    );
                },
            )
            .where('prompt.ai_thread_uuid', threadUuid)
            .whereNull('tool_call.parent_tool_call_id')
            .orderBy('tool_call.created_at', 'asc')
            .select<ToolRow[]>({
                promptUuid: 'tool_call.ai_prompt_uuid',
                toolCallId: 'tool_call.tool_call_id',
                name: 'tool_call.tool_name',
                args: 'tool_call.tool_args',
                result: 'tool_result.result',
                mcpServerUuid: 'tool_call.ai_mcp_server_uuid',
            });
        const toolsByPrompt = toolRows.reduce((map, row) => {
            const tools = map.get(row.promptUuid) ?? [];
            tools.push(row);
            map.set(row.promptUuid, tools);
            return map;
        }, new Map<string, ToolRow[]>());

        return {
            threadUuid: first.threadUuid,
            organizationUuid: first.organizationUuid,
            projectUuid: first.projectUuid,
            agentUuid: first.agentUuid,
            userUuid:
                promptRows.findLast((row) => row.userUuid !== null)?.userUuid ??
                null,
            title: first.title,
            createdFrom: first.createdFrom,
            projectType: first.projectType,
            latestActivity: first.latestActivity,
            distilledUpTo: first.distilledUpTo,
            turns: visiblePromptRows.map((row) => ({
                promptUuid: row.promptUuid,
                createdAt: row.createdAt,
                userText: row.userText,
                assistantText: row.assistantText,
                errorMessage: row.errorMessage,
                respondedAt: row.respondedAt,
                interrupted: row.interruptUuid !== null,
                tools: (toolsByPrompt.get(row.promptUuid) ?? []).map(
                    (tool: ToolRow) => ({
                        toolCallId: tool.toolCallId,
                        name: tool.name,
                        args: tool.args,
                        result: tool.result,
                        source: tool.mcpServerUuid ? 'mcp' : 'lightdash',
                    }),
                ),
            })),
        };
    }

    async upsertSourceThreadMemory(
        memory: SourceThreadMemory,
    ): Promise<DbAiAgentMemory> {
        const content = {
            title: memory.title,
            raw_memory: memory.rawMemory,
            thread_summary: memory.threadSummary,
            terms: JSON.stringify(memory.terms),
            objects: JSON.stringify(memory.objects),
            unresolved_objects: JSON.stringify(memory.unresolvedObjects),
            generated_at: memory.generatedAt,
        };
        const [row] = await this.database<AiAgentMemoryTable>(
            AiAgentMemoryTableName,
        )
            .insert({
                organization_uuid: memory.organizationUuid,
                project_uuid: memory.projectUuid,
                agent_uuid: memory.agentUuid,
                user_uuid: memory.userUuid,
                source_thread_uuid: memory.sourceThreadUuid,
                slug: memory.slug,
                ...content,
            })
            .onConflict(
                this.database.raw(
                    "(source_thread_uuid) WHERE status = 'active' AND source_thread_uuid IS NOT NULL",
                ),
            )
            .merge({
                ...content,
                updated_at: this.database.fn.now(),
            })
            .returning([
                'ai_agent_memory_uuid',
                'organization_uuid',
                'project_uuid',
                'agent_uuid',
                'user_uuid',
                'source_thread_uuid',
                'slug',
                'title',
                'raw_memory',
                'thread_summary',
                'terms',
                'objects',
                'unresolved_objects',
                'status',
                'superseded_by_uuid',
                'generated_at',
                'cited_count',
                'last_cited_at',
                'pulled_count',
                'last_pulled_at',
                'created_at',
                'updated_at',
            ]);

        return row;
    }

    async upsertThreadDistill(
        result: ThreadDistillResult,
    ): Promise<DbAiAgentThreadDistill> {
        const noOpReason =
            result.outcome === 'no_op' ? result.noOpReason : null;
        const errorMessage =
            result.outcome === 'failed' ? result.errorMessage : null;
        const content = {
            outcome: result.outcome,
            no_op_reason: noOpReason,
            error_message: errorMessage,
            distill_prompt_hash: result.distillPromptHash,
            distilled_up_to: result.distilledUpTo,
        };
        const [row] = await this.database<AiAgentThreadDistillTable>(
            AiAgentThreadDistillTableName,
        )
            .insert({
                ai_thread_uuid: result.aiThreadUuid,
                ...content,
            })
            .onConflict('ai_thread_uuid')
            .merge({
                ...content,
                updated_at: this.database.fn.now(),
            })
            .returning([
                'ai_agent_thread_distill_uuid',
                'ai_thread_uuid',
                'outcome',
                'no_op_reason',
                'error_message',
                'distill_prompt_hash',
                'distilled_up_to',
                'created_at',
                'updated_at',
            ]);

        return row;
    }

    async findActiveForProject(args: {
        projectUuid: string;
        limit?: number;
    }): Promise<DbAiAgentMemory[]> {
        const query = this.database<AiAgentMemoryTable>(AiAgentMemoryTableName)
            .where('project_uuid', args.projectUuid)
            .where('status', 'active')
            .orderBy('last_cited_at', 'desc', 'last')
            .orderBy('generated_at', 'desc');

        if (args.limit !== undefined) {
            void query.limit(args.limit);
        }

        return query;
    }

    async findByProjectAndSlug(args: {
        projectUuid: string;
        slug: string;
    }): Promise<AiAgentMemoryWithLineage | undefined> {
        const memory = await this.database<AiAgentMemoryTable>(
            AiAgentMemoryTableName,
        )
            .where('project_uuid', args.projectUuid)
            .where('slug', args.slug)
            .first();
        if (!memory) return undefined;

        const lineageRows =
            memory.source_thread_uuid && memory.thread_summary
                ? [memory]
                : (
                      await this.database.raw<{
                          rows: DbAiAgentMemory[];
                      }>(
                          `
                            WITH RECURSIVE lineage AS (
                                SELECT child.*, ARRAY[?::uuid, child.ai_agent_memory_uuid] AS lineage_path
                                FROM ${AiAgentMemoryTableName} AS child
                                WHERE child.project_uuid = ?
                                  AND child.superseded_by_uuid = ?

                                UNION ALL

                                SELECT child.*, lineage.lineage_path || child.ai_agent_memory_uuid
                                FROM ${AiAgentMemoryTableName} AS child
                                INNER JOIN lineage
                                    ON child.superseded_by_uuid = lineage.ai_agent_memory_uuid
                                WHERE child.project_uuid = ?
                                  AND NOT child.ai_agent_memory_uuid = ANY(lineage.lineage_path)
                            )
                            SELECT * FROM lineage
                            WHERE source_thread_uuid IS NOT NULL
                              AND thread_summary IS NOT NULL
                          `,
                          [
                              memory.ai_agent_memory_uuid,
                              args.projectUuid,
                              memory.ai_agent_memory_uuid,
                              args.projectUuid,
                          ],
                      )
                  ).rows;

        const threadUuids = lineageRows.flatMap((row) =>
            row.source_thread_uuid ? [row.source_thread_uuid] : [],
        );
        const threadTitles = new Map(
            threadUuids.length === 0
                ? []
                : (
                      await this.database(AiThreadTableName)
                          .whereIn(
                              `${AiThreadTableName}.ai_thread_uuid`,
                              threadUuids,
                          )
                          .select<
                              Array<{
                                  ai_thread_uuid: string;
                                  title: string | null;
                              }>
                          >(
                              `${AiThreadTableName}.ai_thread_uuid`,
                              `${AiThreadTableName}.title`,
                          )
                  ).map(
                      (thread) =>
                          [thread.ai_thread_uuid, thread.title] as const,
                  ),
        );
        const sources = lineageRows.map((row) => ({
            slug: row.slug,
            agent_uuid: row.agent_uuid,
            source_thread_uuid: row.source_thread_uuid,
            thread_summary: row.thread_summary,
            thread_title: row.source_thread_uuid
                ? (threadTitles.get(row.source_thread_uuid) ?? null)
                : null,
        }));

        const replacement = memory.superseded_by_uuid
            ? ((
                  await this.database.raw<{
                      rows: Array<Pick<DbAiAgentMemory, 'slug'>>;
                  }>(
                      `
                        WITH RECURSIVE replacements AS (
                            SELECT next.ai_agent_memory_uuid, next.slug, next.superseded_by_uuid,
                                   ARRAY[?::uuid, next.ai_agent_memory_uuid] AS replacement_path,
                                   1 AS depth
                            FROM ${AiAgentMemoryTableName} AS next
                            WHERE next.project_uuid = ?
                              AND next.ai_agent_memory_uuid = ?

                            UNION ALL

                            SELECT next.ai_agent_memory_uuid, next.slug, next.superseded_by_uuid,
                                   replacements.replacement_path || next.ai_agent_memory_uuid,
                                   replacements.depth + 1
                            FROM ${AiAgentMemoryTableName} AS next
                            INNER JOIN replacements
                                ON next.ai_agent_memory_uuid = replacements.superseded_by_uuid
                            WHERE next.project_uuid = ?
                              AND NOT next.ai_agent_memory_uuid = ANY(replacements.replacement_path)
                        )
                        SELECT slug FROM replacements
                        ORDER BY depth DESC
                        LIMIT 1
                      `,
                      [
                          memory.ai_agent_memory_uuid,
                          args.projectUuid,
                          memory.superseded_by_uuid,
                          args.projectUuid,
                      ],
                  )
              ).rows[0] ?? null)
            : null;

        return { memory, sources, replacement };
    }

    async incrementPulledForActiveMemories(args: {
        projectUuid: string;
        slugs: string[];
    }): Promise<void> {
        const slugs = [...new Set(args.slugs)];
        if (slugs.length === 0) return;

        await this.database<AiAgentMemoryTable>(AiAgentMemoryTableName)
            .where('project_uuid', args.projectUuid)
            .where('status', 'active')
            .whereIn('slug', slugs)
            .update({
                pulled_count: this.database.raw('pulled_count + 1'),
                last_pulled_at: this.database.fn.now(),
            } as never);
    }

    async incrementCitedForActiveMemories(args: {
        projectUuid: string;
        slugs: string[];
    }): Promise<string[]> {
        const slugs = [...new Set(args.slugs)];
        if (slugs.length === 0) return [];

        const rows = await this.database<AiAgentMemoryTable>(
            AiAgentMemoryTableName,
        )
            .where('project_uuid', args.projectUuid)
            .where('status', 'active')
            .whereIn('slug', slugs)
            .update({
                cited_count: this.database.raw('cited_count + 1'),
                last_cited_at: this.database.fn.now(),
            } as never)
            .returning('slug');

        return rows.map(({ slug }) => slug);
    }
}
