import {
    NotFoundError,
    type AiRouter,
    type AiRouterDecision,
    type AiRouterDecisionConfidence,
    type AiRouterDecisionListFilters,
    type AiRouterSelectionMode,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AiRouterDecisionTableName,
    AiRouterTableName,
    type DbAiRouter,
    type DbAiRouterDecision,
} from '../database/entities/aiRouter';

const toAiRouter = (row: DbAiRouter): AiRouter => ({
    routerUuid: row.ai_router_uuid,
    organizationUuid: row.organization_uuid,
    enabled: row.enabled,
    projectUuids: row.project_uuids,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const toAiRouterDecision = (row: DbAiRouterDecision): AiRouterDecision => ({
    decisionUuid: row.ai_router_decision_uuid,
    routerUuid: row.ai_router_uuid,
    threadUuid: row.thread_uuid,
    userUuid: row.user_uuid,
    prompt: row.prompt,
    suggestedAgentUuid: row.suggested_agent_uuid,
    chosenAgentUuid: row.chosen_agent_uuid,
    confidence: row.confidence,
    reasoning: row.reasoning,
    candidateAgentUuids: row.candidate_agent_uuids,
    selectionMode: row.selection_mode,
    createdAt: row.created_at,
    committedAt: row.committed_at,
});

export class AiRouterModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async findByOrganization(
        organizationUuid: string,
    ): Promise<AiRouter | null> {
        const row = await this.database(AiRouterTableName)
            .where({ organization_uuid: organizationUuid })
            .first();
        return row ? toAiRouter(row) : null;
    }

    async upsert({
        organizationUuid,
        enabled,
        projectUuids,
    }: {
        organizationUuid: string;
        enabled?: boolean;
        projectUuids?: string[];
    }): Promise<AiRouter> {
        const insertPayload: {
            organization_uuid: string;
            enabled?: boolean;
            project_uuids?: string[];
        } = { organization_uuid: organizationUuid };

        if (enabled !== undefined) insertPayload.enabled = enabled;
        if (projectUuids !== undefined)
            insertPayload.project_uuids = projectUuids;

        const updatePayload: Record<string, unknown> = {
            updated_at: this.database.fn.now(),
        };
        if (enabled !== undefined) updatePayload.enabled = enabled;
        if (projectUuids !== undefined)
            updatePayload.project_uuids = projectUuids;

        const [row] = await this.database(AiRouterTableName)
            .insert(insertPayload)
            .onConflict('organization_uuid')
            .merge(updatePayload)
            .returning('*');

        return toAiRouter(row);
    }

    async createDecision(args: {
        routerUuid: string;
        userUuid: string;
        prompt: string;
        suggestedAgentUuid: string;
        confidence: AiRouterDecisionConfidence;
        reasoning: string;
        candidateAgentUuids: string[];
    }): Promise<AiRouterDecision> {
        const [row] = await this.database(AiRouterDecisionTableName)
            .insert({
                ai_router_uuid: args.routerUuid,
                user_uuid: args.userUuid,
                prompt: args.prompt,
                suggested_agent_uuid: args.suggestedAgentUuid,
                confidence: args.confidence,
                reasoning: args.reasoning,
                candidate_agent_uuids: args.candidateAgentUuids,
            })
            .returning('*');
        return toAiRouterDecision(row);
    }

    async commitDecision(args: {
        decisionUuid: string;
        chosenAgentUuid: string;
        threadUuid: string;
        selectionMode: AiRouterSelectionMode;
    }): Promise<AiRouterDecision> {
        const [row] = await this.database(AiRouterDecisionTableName)
            .where({ ai_router_decision_uuid: args.decisionUuid })
            .whereNull('chosen_agent_uuid')
            .update({
                chosen_agent_uuid: args.chosenAgentUuid,
                thread_uuid: args.threadUuid,
                selection_mode: args.selectionMode,
                committed_at: this.database.fn.now(),
            })
            .returning('*');
        if (!row) {
            throw new NotFoundError(
                `AI router decision ${args.decisionUuid} not found or already committed`,
            );
        }
        return toAiRouterDecision(row);
    }

    async getDecision(decisionUuid: string): Promise<AiRouterDecision> {
        const row = await this.database(AiRouterDecisionTableName)
            .where({ ai_router_decision_uuid: decisionUuid })
            .first();
        if (!row) {
            throw new NotFoundError(
                `AI router decision ${decisionUuid} not found`,
            );
        }
        return toAiRouterDecision(row);
    }

    async listDecisions({
        routerUuid,
        filters,
        limit = 100,
    }: {
        routerUuid: string;
        filters?: AiRouterDecisionListFilters;
        limit?: number;
    }): Promise<AiRouterDecision[]> {
        let query = this.database(AiRouterDecisionTableName)
            .where({ ai_router_uuid: routerUuid })
            .orderBy('created_at', 'desc')
            .limit(limit);

        if (filters?.confidence)
            query = query.andWhere('confidence', filters.confidence);
        if (filters?.selectionMode)
            query = query.andWhere('selection_mode', filters.selectionMode);
        if (filters?.fromDate)
            query = query.andWhere('created_at', '>=', filters.fromDate);
        if (filters?.toDate)
            query = query.andWhere('created_at', '<=', filters.toDate);

        const rows = await query;
        return rows.map(toAiRouterDecision);
    }
}
