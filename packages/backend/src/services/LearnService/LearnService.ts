import {
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    LearnCatalogueSchema,
    LearnCourseSchema,
    LearnEventInputSchema,
    LearnProgressResponseSchema,
    NotFoundError,
    ParameterError,
    UnexpectedServerError,
    type Account,
    type ApiLearnEventsResponse,
    type LearnCatalogue,
    type LearnCourse,
    type LearnEventInput,
    type LearnProgressResults,
} from '@lightdash/common';
import type { LightdashConfig } from '../../config/parseConfig';
import { BaseService } from '../BaseService';
import type { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';

const LEARN_REQUEST_TIMEOUT_MS = 10_000;
const MAX_EVENTS_PER_REQUEST = 100;

type Dependencies = {
    lightdashConfig: LightdashConfig;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
};

export class LearnService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagService: Pick<FeatureFlagService, 'get'>;

    constructor({ lightdashConfig, featureFlagService }: Dependencies) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.featureFlagService = featureFlagService;
    }

    private async assertLearnEnabled(account: Account): Promise<void> {
        assertRegisteredAccount(account);
        const flag = await this.featureFlagService.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: account.organization?.organizationUuid,
            },
            featureFlagId: FeatureFlags.LearnSection,
        });
        if (!flag.enabled) {
            throw new ForbiddenError('Learn is not available');
        }
    }

    private async fetchUpstream(
        url: string,
        init: RequestInit = {},
    ): Promise<Response> {
        try {
            return await fetch(url, {
                ...init,
                signal: AbortSignal.timeout(LEARN_REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            this.logger.warn('Could not reach the Learn service', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw new UnexpectedServerError('Could not load Learn content');
        }
    }

    private static async parseJson(response: Response): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            throw new UnexpectedServerError('Could not load Learn content');
        }
    }

    async getCatalogue(account: Account): Promise<LearnCatalogue> {
        await this.assertLearnEnabled(account);
        const response = await this.fetchUpstream(
            `${this.lightdashConfig.learn.contentBaseUrl}/catalogue.json`,
        );
        if (!response.ok) {
            this.logger.warn('Learn content service returned an error', {
                statusCode: response.status,
            });
            throw new UnexpectedServerError('Could not load Learn content');
        }
        const parsed = LearnCatalogueSchema.safeParse(
            await LearnService.parseJson(response),
        );
        if (!parsed.success) {
            this.logger.warn('Learn catalogue failed validation', {
                issueCount: parsed.error.issues.length,
            });
            throw new UnexpectedServerError('Could not load Learn content');
        }
        return parsed.data;
    }

    async getCourse(account: Account, courseId: string): Promise<LearnCourse> {
        const catalogue = await this.getCatalogue(account);
        const entry = catalogue.courses.find((c) => c.id === courseId);
        if (!entry) {
            throw new NotFoundError(`Course not found: ${courseId}`);
        }
        const { contentBaseUrl } = this.lightdashConfig.learn;
        const response = await this.fetchUpstream(
            `${contentBaseUrl}/${entry.path}`,
        );
        if (!response.ok) {
            this.logger.warn('Learn course payload returned an error', {
                statusCode: response.status,
            });
            throw new UnexpectedServerError('Could not load Learn content');
        }
        const parsed = LearnCourseSchema.safeParse(
            await LearnService.parseJson(response),
        );
        if (!parsed.success) {
            this.logger.warn('Learn course failed validation', {
                issueCount: parsed.error.issues.length,
            });
            throw new UnexpectedServerError('Could not load Learn content');
        }
        return {
            ...parsed.data,
            assetBaseUrl: `${contentBaseUrl}/courses/${entry.id}/${entry.contentHash}`,
        };
    }

    private progressRequest(
        account: Account,
        path: string,
        init: RequestInit = {},
    ): Promise<Response> {
        const { progressApiUrl, serviceToken } = this.lightdashConfig.learn;
        if (!serviceToken) {
            throw new UnexpectedServerError('Learn progress is not configured');
        }
        const email = encodeURIComponent(account.user?.email ?? '');
        return this.fetchUpstream(`${progressApiUrl}${path}?email=${email}`, {
            ...init,
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${serviceToken}`,
                ...(init.headers ?? {}),
            },
        });
    }

    async getProgress(account: Account): Promise<LearnProgressResults> {
        await this.assertLearnEnabled(account);
        if (!this.lightdashConfig.learn.serviceToken) {
            return { courses: null, serverSynced: false };
        }
        const response = await this.progressRequest(
            account,
            '/api/v1/progress',
        );
        if (!response.ok) {
            this.logger.warn('Learn progress service returned an error', {
                statusCode: response.status,
            });
            throw new UnexpectedServerError('Could not load Learn progress');
        }
        const parsed = LearnProgressResponseSchema.safeParse(
            await LearnService.parseJson(response),
        );
        if (!parsed.success) {
            this.logger.warn('Learn progress failed validation', {
                issueCount: parsed.error.issues.length,
            });
            throw new UnexpectedServerError('Could not load Learn progress');
        }
        return { courses: parsed.data.courses, serverSynced: true };
    }

    async recordEvents(
        account: Account,
        events: unknown,
    ): Promise<ApiLearnEventsResponse['results']> {
        await this.assertLearnEnabled(account);
        const parsed = LearnEventInputSchema.array()
            .min(1)
            .max(MAX_EVENTS_PER_REQUEST)
            .safeParse(events);
        if (!parsed.success) {
            throw new ParameterError('Invalid Learn events payload');
        }
        if (!this.lightdashConfig.learn.serviceToken) {
            // No server sync configured: accept and drop — the client also
            // keeps local progress, so learners lose nothing they can see.
            return { accepted: 0 };
        }
        const body: Array<LearnEventInput & { source: 'learn' }> =
            parsed.data.map((event) => ({ ...event, source: 'learn' }));
        const response = await this.progressRequest(account, '/api/v1/events', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            this.logger.warn('Learn events write failed', {
                statusCode: response.status,
            });
            throw new UnexpectedServerError('Could not save Learn progress');
        }
        const payload = (await LearnService.parseJson(response)) as {
            accepted?: number;
        };
        return { accepted: payload.accepted ?? body.length };
    }
}
