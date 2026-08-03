import {
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    LearnCatalogueSchema,
    LearnCourseSchema,
    NotFoundError,
    UnexpectedServerError,
    type Account,
    type LearnCatalogue,
    type LearnCourse,
} from '@lightdash/common';
import type { LightdashConfig } from '../../config/parseConfig';
import { BaseService } from '../BaseService';
import type { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';

const LEARN_REQUEST_TIMEOUT_MS = 10_000;

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
}
