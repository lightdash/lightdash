import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    ROADMAP_DEFAULT_PAGE_SIZE,
    RoadmapProjectQuerySchema,
    RoadmapProjectRequestsResponseSchema,
    RoadmapProjectResponseSchema,
    RoadmapQuerySchema,
    RoadmapResponseSchema,
    UnexpectedServerError,
    type Account,
    type RoadmapProjectQuery,
    type RoadmapProjectResults,
    type RoadmapQuery,
    type RoadmapResults,
} from '@lightdash/common';
import { z } from 'zod';
import type { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import type { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';

const ROADMAP_REQUEST_TIMEOUT_MS = 10_000;

type Dependencies = {
    lightdashConfig: LightdashConfig;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
};

export class RoadmapService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagService: Pick<FeatureFlagService, 'get'>;

    constructor({ lightdashConfig, featureFlagService }: Dependencies) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.featureFlagService = featureFlagService;
    }

    private async authorize(account: Account) {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const roadmapFlag = await this.featureFlagService.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid,
            },
            featureFlagId: FeatureFlags.OrganizationRoadmap,
        });
        const ability = this.createAuditedAbility(account);

        if (
            !roadmapFlag.enabled ||
            ability.cannot(
                'view',
                subject('Roadmap', {
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'The organization roadmap is not available',
            );
        }

        const { licenseKey } = this.lightdashConfig.license;
        if (!licenseKey) {
            throw new UnexpectedServerError(
                'Could not load the organization roadmap',
            );
        }

        return { organizationUuid, licenseKey };
    }

    async getProjects(
        account: Account,
        query: RoadmapProjectQuery = {},
    ): Promise<RoadmapProjectResults> {
        const { organizationUuid, licenseKey } = await this.authorize(account);
        const parsed = RoadmapProjectQuerySchema.safeParse(query);
        if (!parsed.success)
            throw new ParameterError('Could not load the organization roadmap');
        const response = await this.request(
            organizationUuid,
            licenseKey,
            '/projects',
            parsed.data,
            RoadmapProjectResponseSchema,
        );
        this.assertFresh(response.results.expiresAt);
        return response.results;
    }

    private assertFresh(expiresAt: string) {
        if (Date.parse(expiresAt) <= Date.now())
            throw new UnexpectedServerError(
                'Could not refresh the organization roadmap',
            );
    }

    async getRoadmap(
        account: Account,
        query: RoadmapQuery = {},
    ): Promise<RoadmapResults> {
        const { organizationUuid, licenseKey } = await this.authorize(account);
        const parsed = RoadmapQuerySchema.safeParse(query);
        if (!parsed.success)
            throw new ParameterError('Could not load the organization roadmap');
        const hasFilters =
            parsed.data.projectId !== undefined ||
            parsed.data.search !== undefined ||
            parsed.data.statuses !== undefined ||
            parsed.data.priorities !== undefined;
        const response = await this.request(
            organizationUuid,
            licenseKey,
            '',
            {
                ...parsed.data,
                pageSize: parsed.data.pageSize ?? ROADMAP_DEFAULT_PAGE_SIZE,
            },
            hasFilters
                ? RoadmapProjectRequestsResponseSchema
                : RoadmapResponseSchema,
        );
        if (response.expiresAt !== undefined)
            this.assertFresh(response.expiresAt);
        return {
            data: response.results,
            pagination: response.pagination,
            facets: response.facets,
            ...(response.expiresAt !== undefined && {
                expiresAt: response.expiresAt,
            }),
        };
    }

    private async request<T>(
        organizationUuid: string,
        licenseKey: string,
        suffix: string,
        query: Record<string, string | number | boolean | undefined>,
        schema: z.ZodType<T>,
    ): Promise<T> {
        const url = new URL(
            '/api/v1/roadmap/organizations',
            this.lightdashConfig.roadmap.baseUrl,
        );
        url.pathname = `${url.pathname}/${encodeURIComponent(organizationUuid)}${suffix}`;
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined) url.searchParams.set(key, String(value));
        });
        let response: Response;
        try {
            response = await fetch(url.toString(), {
                headers: {
                    'lightdash-license-key': licenseKey,
                },
                signal: AbortSignal.timeout(ROADMAP_REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            this.logger.warn('Could not reach the roadmap service', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw new UnexpectedServerError(
                'Could not load the organization roadmap',
            );
        }

        // 401/403 means the instance license is not bound to this org in the
        // roadmap service — a provisioning state, not a transient failure.
        if (response.status === 401 || response.status === 403) {
            this.logger.warn('Roadmap service denied the request', {
                statusCode: response.status,
            });
            throw new ForbiddenError(
                'The organization roadmap is not available',
            );
        }

        if (!response.ok) {
            this.logger.warn('Roadmap service returned an error', {
                statusCode: response.status,
            });
            throw new UnexpectedServerError(
                'Could not load the organization roadmap',
            );
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new UnexpectedServerError(
                'Could not load the organization roadmap',
            );
        }

        const parsedResponse = schema.safeParse(payload);
        if (!parsedResponse.success) {
            this.logger.warn('Roadmap service returned an invalid response', {
                issueCount: parsedResponse.error.issues.length,
            });
            throw new UnexpectedServerError(
                'Could not load the organization roadmap',
            );
        }

        return parsedResponse.data;
    }
}
