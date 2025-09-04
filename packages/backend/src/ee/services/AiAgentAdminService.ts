import { subject } from '@casl/ability';
import {
    AiAgentAdminConversationsSummary,
    AiAgentAdminFilters,
    AiAgentAdminSort,
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentModel } from '../models/AiAgentModel';

type AiAgentAdminServiceDependencies = {
    aiAgentModel: AiAgentModel;
};

export class AiAgentAdminService {
    private readonly aiAgentModel: AiAgentModel;

    constructor(dependencies: AiAgentAdminServiceDependencies) {
        this.aiAgentModel = dependencies.aiAgentModel;
    }

    private static checkOrganizationAdminAccess(user: SessionUser): void {
        if (
            user.ability.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to access organization-wide AI agent data',
            );
        }
    }

    /**
     * Get all threads across all agents in the organization
     * Only accessible by organization admins
     */
    async getAllThreads(
        user: SessionUser,
        paginateArgs?: KnexPaginateArgs,
        filters?: AiAgentAdminFilters,
        sort?: AiAgentAdminSort,
    ): Promise<KnexPaginatedData<AiAgentAdminConversationsSummary>> {
        const { organizationUuid } = user;

        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        AiAgentAdminService.checkOrganizationAdminAccess(user);

        // TODO: Check if filter contains userUuid and check if they exist in the organization
        // TODO: Check if filter contains agentUuid and check if they exist in the organization
        // TODO: Check if filter contains projectUuid and check if they exist in the organization

        return this.aiAgentModel.findAdminThreadsPaginated({
            organizationUuid,
            paginateArgs,
            filters,
            sort,
        });
    }
}
