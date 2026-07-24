import type { AiProjectContextTypedObjectRef } from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiAgentMemoryTableName,
    AiAgentThreadDistillTableName,
    type AiAgentMemoryTable,
    type AiAgentThreadDistillTable,
    type DbAiAgentMemory,
    type DbAiAgentThreadDistill,
} from '../database/entities/aiAgentMemory';

type SourceThreadMemory = {
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    userUuid: string | null;
    sourceThreadUuid: string;
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
    aiThreadUuid: string;
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
          outcome: 'failed';
          noOpReason?: never;
          errorMessage: string;
      }
);

export class AiAgentMemoryModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
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
            .orderByRaw('last_cited_at DESC NULLS LAST')
            .orderBy('generated_at', 'desc');

        if (args.limit !== undefined) {
            void query.limit(args.limit);
        }

        return query;
    }
}
