import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    ROADMAP_DEFAULT_PAGE_SIZE,
    RoadmapQuerySchema,
    RoadmapResponseSchema,
    UnexpectedServerError,
    type Account,
    type RoadmapQuery,
    type RoadmapResults,
} from '@lightdash/common';
import type { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import type { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';

const ROADMAP_URL =
    'https://roadmap.lightdash.com/api/v1/roadmap/organizations';
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

    async getRoadmap(
        account: Account,
        query: RoadmapQuery = {},
    ): Promise<RoadmapResults> {
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

        const parsedQuery = RoadmapQuerySchema.safeParse(query);
        if (!parsedQuery.success) {
            this.logger.warn('Could not parse roadmap query', {
                issues: parsedQuery.error.issues,
            });
            throw new ParameterError('Could not load the organization roadmap');
        }

        let url: URL;
        try {
            url = new URL(ROADMAP_URL);
            const basePath = url.pathname.replace(/\/$/, '');
            url.pathname = `${basePath}/${encodeURIComponent(organizationUuid)}`;
        } catch {
            throw new UnexpectedServerError(
                'Could not load the organization roadmap',
            );
        }
        const paginationQuery = {
            ...parsedQuery.data,
            pageSize: parsedQuery.data.pageSize ?? ROADMAP_DEFAULT_PAGE_SIZE,
        };
        Object.entries(paginationQuery).forEach(([key, value]) => {
            if (value !== undefined) {
                url.searchParams.set(key, String(value));
            }
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

        const parsedResponse = RoadmapResponseSchema.safeParse(payload);
        if (!parsedResponse.success) {
            this.logger.warn('Roadmap service returned an invalid response', {
                issueCount: parsedResponse.error.issues.length,
            });
            throw new UnexpectedServerError(
                'Could not load the organization roadmap',
            );
        }

        return {
            data: parsedResponse.data.results,
            pagination: parsedResponse.data.pagination,
            facets: parsedResponse.data.facets,
        };
    }
}
