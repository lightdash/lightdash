import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    ROADMAP_DEFAULT_PAGE_SIZE,
    RoadmapFollowProjectRequestSchema,
    RoadmapFollowProjectResponseSchema,
    RoadmapProjectQuerySchema,
    RoadmapProjectRequestsResponseSchema,
    RoadmapProjectResponseSchema,
    RoadmapQuerySchema,
    RoadmapResponseSchema,
    UnexpectedServerError,
    type Account,
    type RoadmapFollowProjectRequest,
    type RoadmapFollowProjectResults,
    type RoadmapProjectQuery,
    type RoadmapProjectResults,
    type RoadmapQuery,
    type RoadmapResults,
    type UUID,
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

    async followProject(
        account: Account,
        projectId: UUID,
        body: RoadmapFollowProjectRequest,
    ): Promise<RoadmapFollowProjectResults> {
        const { organizationUuid, licenseKey } = await this.authorize(account);
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Roadmap', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to request to follow roadmap projects',
            );
        }
        const parsed = RoadmapFollowProjectRequestSchema.safeParse(body);
        const parsedProjectId = z.uuid().safeParse(projectId);
        if (!parsed.success || !parsedProjectId.success) {
            throw new ParameterError(
                'Provide a valid project and a note of 1–2000 characters',
            );
        }
        const identity = z
            .object({
                organizationName: z.string().trim().min(1).max(255),
                user: z.object({
                    userUuid: z.uuid(),
                    name: z.string().trim().min(1).max(255),
                    email: z.string().trim().max(320).pipe(z.email()),
                }),
            })
            .safeParse({
                organizationName: account.organization.name,
                user: {
                    userUuid: account.user.userUuid,
                    name: `${account.user.firstName} ${account.user.lastName}`.trim(),
                    email: account.user.email,
                },
            });
        if (!identity.success) {
            throw new ParameterError(
                'Your organization name, user name and email are required to send this request',
            );
        }
        const response = await this.request(
            organizationUuid,
            licenseKey,
            `/projects/${encodeURIComponent(parsedProjectId.data)}/follow`,
            {},
            RoadmapFollowProjectResponseSchema,
            {
                method: 'POST',
                body: JSON.stringify({ ...identity.data, ...parsed.data }),
                timeoutMs: 120_000,
                errorMessage:
                    'Could not send the roadmap request. Please try again.',
            },
        );
        return response.results;
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
        options: {
            method: 'GET' | 'POST';
            body?: string;
            timeoutMs: number;
            errorMessage: string;
        } = {
            method: 'GET',
            timeoutMs: ROADMAP_REQUEST_TIMEOUT_MS,
            errorMessage: 'Could not load the organization roadmap',
        },
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
                method: options.method,
                body: options.body,
                headers: {
                    'lightdash-license-key': licenseKey,
                    ...(options.method === 'POST' && {
                        'Content-Type': 'application/json',
                    }),
                },
                signal: AbortSignal.timeout(options.timeoutMs),
            });
        } catch {
            this.logger.warn('Could not reach the roadmap service');
            throw new UnexpectedServerError(options.errorMessage);
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

        if (options.method === 'POST' && response.status === 404) {
            throw new NotFoundError(
                'This roadmap project is no longer available',
            );
        }
        if (
            !response.ok ||
            (options.method === 'POST' && response.status !== 200)
        ) {
            this.logger.warn('Roadmap service returned an error', {
                statusCode: response.status,
            });
            throw new UnexpectedServerError(options.errorMessage);
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new UnexpectedServerError(options.errorMessage);
        }

        const parsedResponse = schema.safeParse(payload);
        if (!parsedResponse.success) {
            this.logger.warn('Roadmap service returned an invalid response', {
                issueCount: parsedResponse.error.issues.length,
            });
            throw new UnexpectedServerError(options.errorMessage);
        }

        return parsedResponse.data;
    }
}
