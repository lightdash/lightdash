import { subject } from '@casl/ability';
import {
    AiAgentAdminConversationsSummary,
    AiAgentAdminFilters,
    AiAgentAdminSort,
    AiAgentSummary,
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    type Account,
} from '@lightdash/common';
import jwt from 'jsonwebtoken';
import { type LightdashConfig } from '../../config/parseConfig';
import { BaseService } from '../../services/BaseService';
import { AiAgentModel } from '../models/AiAgentModel';

type AiAgentAdminServiceDependencies = {
    aiAgentModel: AiAgentModel;
    lightdashConfig: LightdashConfig;
};

export class AiAgentAdminService extends BaseService {
    private readonly aiAgentModel: AiAgentModel;

    private readonly lightdashConfig: LightdashConfig;

    constructor(dependencies: AiAgentAdminServiceDependencies) {
        super();
        this.aiAgentModel = dependencies.aiAgentModel;
        this.lightdashConfig = dependencies.lightdashConfig;
    }

    private checkOrganizationAdminAccess(account: Account): void {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: account.organization.organizationUuid!,
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
        account: Account,
        paginateArgs?: KnexPaginateArgs,
        filters?: AiAgentAdminFilters,
        sort?: AiAgentAdminSort,
    ): Promise<KnexPaginatedData<AiAgentAdminConversationsSummary>> {
        const { organizationUuid } = account.organization;

        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(account);

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

    async listAgents(account: Account): Promise<AiAgentSummary[]> {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(account);
        return this.aiAgentModel.findAllAgents({
            organizationUuid,
        });
    }

    /**
     * Generate an embed token for the analytics dashboard
     * Only accessible by organization admins
     *
     * Security considerations:
     * - Only uses authenticated user's organization UUID (no client-controlled filtering)
     * - Token includes user email and a unique external ID for audit trails
     * - Token expires after 1 hour to limit exposure
     * - TODO: Add rate limiting to prevent token generation abuse
     * - TODO: Consider caching tokens to reduce generation overhead
     *
     * @param user - The authenticated session user (must be org admin)
     * @returns JWT token and embed URL for the analytics dashboard
     */
    async generateEmbedToken(
        account: Account,
    ): Promise<{ token: string; url: string }> {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        this.checkOrganizationAdminAccess(account);

        const { analyticsEmbedSecret } = this.lightdashConfig;

        if (!analyticsEmbedSecret) {
            throw new Error('ANALYTICS_EMBED_SECRET is not configured');
        }

        const projectUuid = this.lightdashConfig.ai?.analyticsProjectUuid;
        const dashboardUuid = this.lightdashConfig.ai?.analyticsDashboardUuid;

        if (!projectUuid || !dashboardUuid) {
            throw new Error(
                'AI agent analytics dashboard configuration is missing. Please configure AI_ANALYTICS_PROJECT_UUID and AI_ANALYTICS_DASHBOARD_UUID',
            );
        }

        const userAttributes: Record<string, string> = {
            lightdash_embed_ai_agents_organization_uuid: organizationUuid,
        };

        const data = {
            content: {
                type: 'dashboard',
                projectUuid,
                dashboardUuid,
                dashboardFiltersInteractivity: {
                    enabled: 'none',
                    allowedFilters: undefined,
                },
                canExportCsv: false,
                canExportImages: false,
                canExportPagePdf: false,
                canDateZoom: false,
                canExplore: false,
                canViewUnderlyingData: false,
            },
            user: {
                externalId: `org_${organizationUuid}_user_${account.user.id}`,
                email: account.user.email,
            },
            userAttributes,
        };

        const token = jwt.sign(data, analyticsEmbedSecret, {
            expiresIn: '1 hour',
        });

        const baseUrl = `https://analytics.lightdash.cloud/embed/${projectUuid}`;
        const url = new URL(`${baseUrl}#${token}`);

        return {
            token,
            url: url.href,
        };
    }
}
