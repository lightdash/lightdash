import {
    ApiCreateAiAgent,
    ApiUpdateAiAgent,
    CommercialFeatureFlags,
    CompiledTable,
    Explore,
    ForbiddenError,
    LightdashUser,
    NotFoundError,
    type SessionUser,
} from '@lightdash/common';
import _ from 'lodash';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { AiAgentModel } from '../models/AiAgentModel';
import type { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';

type AiAgentServiceDependencies = {
    // models
    aiAgentModel: AiAgentModel;
    slackAuthenticationModel: CommercialSlackAuthenticationModel;
    // services
    featureFlagService: FeatureFlagService;
    slackClient: SlackClient;
};

type FilterableTable = {
    dimensions: Record<string, { tags?: string[] }>;
    metrics: Record<string, { tags?: string[] }>;
};

type FilterableExplore<T extends FilterableTable = FilterableTable> = {
    tags: string[];
    baseTable: string;
    tables: { [tableName: string]: T };
};

export class AiAgentService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly slackAuthenticationModel: CommercialSlackAuthenticationModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly slackClient: SlackClient;

    constructor(dependencies: AiAgentServiceDependencies) {
        // models
        this.aiAgentModel = dependencies.aiAgentModel;
        this.slackAuthenticationModel = dependencies.slackAuthenticationModel;
        // services
        this.featureFlagService = dependencies.featureFlagService;
        this.slackClient = dependencies.slackClient;
    }

    /**
     * @description
     *
     * No tags are configured in settings UI:
     *
     * | Tagging Scenario                  | AI Visibility                    |
     * |-----------------------------------|----------------------------------|
     * | No tags configured in settings UI | Everything is visible by default |
     *
     * ---
     *
     * Tags are configured in settings UI:
     *
     * | Tagging Scenario                     | AI Visibility               |
     * |--------------------------------------|-----------------------------|
     * | Explore only (with matching tag)     | All fields in the Explore   |
     * | Some fields only (with matching tag) | Only those tagged fields    |
     * | Explore + some fields (with match)   | Only those tagged fields    |
     * | No matching tags                     | Nothing is visible          |
     */
    static filterExplore<E extends FilterableExplore>({
        explore,
        availableTags,
    }: {
        explore: E;
        availableTags: string[] | null;
    }) {
        if (!availableTags) {
            return explore;
        }

        const baseTable = explore.tables[explore.baseTable];
        if (!baseTable) {
            throw new Error(`Base table not found`);
        }

        function hasMatchingTags(tags: string[]) {
            return _.intersection(tags, availableTags).length > 0;
        }

        function checkIfTableFieldsHasMatchingTags<T extends FilterableTable>(
            table: T,
        ) {
            return hasMatchingTags(
                _.concat(
                    _.flatMap(table.metrics, (m) => m.tags ?? []),
                    _.flatMap(table.dimensions, (d) => d.tags ?? []),
                ),
            );
        }

        function checkIfExploreHasMatchingTags(e: E) {
            if (hasMatchingTags(e.tags)) {
                return true;
            }

            if (checkIfTableFieldsHasMatchingTags(baseTable)) {
                return true;
            }

            return false;
        }

        if (!checkIfExploreHasMatchingTags(explore)) {
            return undefined;
        }

        if (!checkIfTableFieldsHasMatchingTags(baseTable)) {
            return explore;
        }

        // TODO: improve typing so we don't have to force cast
        const filteredExplore: Explore = _.update(explore, 'tables', (tables) =>
            _.mapValues(tables, (table) => ({
                ...table,
                dimensions: _.pickBy(table.dimensions, (d) =>
                    hasMatchingTags(d.tags ?? []),
                ),
                metrics: _.pickBy(table.metrics, (m) =>
                    hasMatchingTags(m.tags ?? []),
                ),
            })),
        );

        console.dir(filteredExplore, { depth: null });

        return filteredExplore;
    }

    private async getIsCopilotEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ) {
        const aiCopilotFlag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        return aiCopilotFlag.enabled;
    }

    public async getAgent(user: SessionUser, agentUuid: string) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        // TODO:
        // permissions

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        return agent;
    }

    public async listAgents(user: SessionUser) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        // TODO:
        // permissions

        const agents = await this.aiAgentModel.findAllAgents({
            organizationUuid,
        });

        return agents;
    }

    async listAgentThreads(user: SessionUser, agentUuid: string) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError();
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const threads = await this.aiAgentModel.findThreads({
            organizationUuid,
            agentUuid,
        });

        return threads;
    }

    async getAgentThread(
        user: SessionUser,
        agentUuid: string,
        threadUuid: string,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.getAgent({
            organizationUuid,
            agentUuid,
        });

        if (!agent) {
            throw new NotFoundError(`Agent not found: ${agentUuid}`);
        }

        const thread = await this.aiAgentModel.getThread({
            organizationUuid,
            agentUuid,
            threadUuid,
        });

        if (!thread) {
            throw new NotFoundError(`Thread not found: ${threadUuid}`);
        }

        const messages = await this.aiAgentModel.findThreadMessages({
            organizationUuid,
            threadUuid,
        });

        if (thread.createdFrom !== 'slack') {
            return {
                ...thread,
                messages,
            };
        }

        const slackUserIds = _.uniq(
            messages
                .filter((message) => message.role === 'user')
                .filter((message) => message.user.slackUserId !== null)
                .map((message) => message.user.slackUserId),
        );

        const slackUsers = await Promise.all(
            slackUserIds.map((userId) =>
                this.slackClient.getUserInfo(organizationUuid, userId!),
            ),
        );

        return {
            ...thread,
            messages: messages.map((message) => {
                if (message.role !== 'user') {
                    return message;
                }

                const slackUser = slackUsers.find(
                    ({ id }) =>
                        message.user.slackUserId != null &&
                        id === message.user.slackUserId,
                );

                return {
                    ...message,
                    user: {
                        name: slackUser?.name ?? message.user.name,
                        uuid: message.user.uuid,
                    },
                };
            }),
        };
    }

    public async createAgent(user: SessionUser, body: ApiCreateAiAgent) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.aiAgentModel.createAgent({
            name: body.name,
            projectUuid: body.projectUuid,
            organizationUuid,
            tags: body.tags,
            integrations: body.integrations,
        });

        return agent;
    }

    public async updateAgent(
        user: SessionUser,
        agentUuid: string,
        body: ApiUpdateAiAgent,
    ) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        const agent = await this.getAgent(user, agentUuid);
        if (agent.organizationUuid !== organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const updatedAgent = await this.aiAgentModel.updateAgent({
            agentUuid,
            name: body.name,
            projectUuid: body.projectUuid,
            organizationUuid,
            tags: body.tags,
            integrations: body.integrations,
        });

        return updatedAgent;
    }

    public async deleteAgent(user: SessionUser, agentUuid: string) {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }

        const agent = await this.getAgent(user, agentUuid);
        if (!agent) {
            throw new ForbiddenError('Agent not found');
        }

        if (agent.organizationUuid !== organizationUuid) {
            throw new ForbiddenError('Agent not found');
        }

        return this.aiAgentModel.deleteAgent({
            organizationUuid,
            agentUuid,
        });
    }
}
