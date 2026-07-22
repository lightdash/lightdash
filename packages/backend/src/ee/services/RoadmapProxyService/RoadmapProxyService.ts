import {
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    MissingConfigError,
    redactRoadmapItems,
    RoadmapItem,
    SessionUser,
    UnexpectedServerError,
} from '@lightdash/common';
import type { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import type { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { ROADMAP_LICENSE_KEY_HEADER } from '../../controllers/authentication/roadmapServiceAuthentication';

type Dependencies = {
    lightdashConfig: LightdashConfig;
    featureFlagService: FeatureFlagService;
};

/**
 * Instance-side proxy to the central roadmap service (server-side proxy is the
 * default v1 topology). Authenticates outbound requests with this instance's
 * license key, which is how the central service resolves the organization —
 * the same trust boundary as license verification, so self-hosted instances
 * need no new egress rule.
 */
export class RoadmapProxyService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagService: FeatureFlagService;

    constructor(dependencies: Dependencies) {
        super({ serviceName: 'RoadmapProxyService' });
        this.lightdashConfig = dependencies.lightdashConfig;
        this.featureFlagService = dependencies.featureFlagService;
    }

    /**
     * Fetch the curated roadmap for the user's organization from the central
     * roadmap service. Gated by the Roadmap feature flag. The response is run
     * through the redaction checkpoint again before it reaches the browser —
     * fail closed even if the upstream service misbehaves.
     */
    async getRoadmapForUser(user: SessionUser): Promise<RoadmapItem[]> {
        const { userUuid, organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const flag = await this.featureFlagService.get({
            user: { userUuid, organizationUuid },
            featureFlagId: FeatureFlags.Roadmap,
        });
        if (!flag.enabled) {
            throw new ForbiddenError(
                'Roadmap is not enabled for this organization',
            );
        }

        const { serviceUrl } = this.lightdashConfig.roadmap;
        const { licenseKey } = this.lightdashConfig.license;
        if (!serviceUrl) {
            throw new MissingConfigError(
                'Roadmap service URL is not configured',
            );
        }
        if (!licenseKey) {
            throw new MissingConfigError('License key is not configured');
        }

        const url = `${serviceUrl.replace(
            /\/+$/,
            '',
        )}/api/v1/roadmap/organizations/${organizationUuid}`;

        let response: Response;
        try {
            response = await fetch(url, {
                headers: { [ROADMAP_LICENSE_KEY_HEADER]: licenseKey },
            });
        } catch (error) {
            this.logger.error(
                `Roadmap proxy: could not reach the roadmap service: ${getErrorMessage(error)}`,
            );
            throw new UnexpectedServerError(
                'Could not reach the roadmap service',
            );
        }

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            // Upstream errors are logged internally but never forwarded to
            // the browser.
            this.logger.error(
                `Roadmap proxy: roadmap service responded with status ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
            );
            throw new UnexpectedServerError('Roadmap service request failed');
        }

        let results: unknown;
        try {
            const parsed = (await response.json()) as { results?: unknown };
            results = parsed.results;
        } catch (error) {
            this.logger.error(
                `Roadmap proxy: could not parse roadmap service response: ${getErrorMessage(error)}`,
            );
            throw new UnexpectedServerError('Roadmap service request failed');
        }
        if (!Array.isArray(results)) {
            this.logger.error(
                'Roadmap proxy: roadmap service response has no results array',
            );
            throw new UnexpectedServerError('Roadmap service request failed');
        }

        const { items, rejected } = redactRoadmapItems(
            results as ReadonlyArray<Record<string, unknown>>,
        );
        if (rejected.length > 0) {
            // The central service should only ever serve curated fields —
            // rejections here mean its curation is broken. Alarm internally
            // and withhold the affected items.
            this.logger.error(
                `Roadmap proxy: redaction rejected ${rejected.length} item(s) from the roadmap service for organization ${organizationUuid}`,
            );
        }
        return items;
    }
}
