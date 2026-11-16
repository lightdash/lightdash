import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    BillingPortalLinkResponseSchema,
    FeatureFlags,
    ForbiddenError,
    LightdashMode,
    NotFoundError,
    UnexpectedServerError,
    type Account,
    type BillingPortalLinkResults,
} from '@lightdash/common';
import type { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../../../services/BaseService';

const BILLING_REQUEST_TIMEOUT_MS = 15_000;
const BILLING_MODES: LightdashMode[] = [
    LightdashMode.CLOUD_BETA,
    LightdashMode.DEV,
];
const UNAVAILABLE_MESSAGE = 'The billing portal is not available';
const FAILURE_MESSAGE = 'Could not open the billing portal. Please try again.';

type Dependencies = {
    analytics: LightdashAnalytics;
    lightdashConfig: LightdashConfig;
    featureFlagModel: FeatureFlagModel;
};

export class BillingService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor({
        analytics,
        lightdashConfig,
        featureFlagModel,
    }: Dependencies) {
        super();
        this.analytics = analytics;
        this.lightdashConfig = lightdashConfig;
        this.featureFlagModel = featureFlagModel;
    }

    async createPortalLink(
        account: Account,
    ): Promise<BillingPortalLinkResults> {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;

        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Billing', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage billing for this organization',
            );
        }

        if (!BILLING_MODES.includes(this.lightdashConfig.mode)) {
            throw new ForbiddenError(UNAVAILABLE_MESSAGE);
        }

        const { enabled } = await this.featureFlagModel.get({
            user: { organizationUuid, userUuid: account.user.userUuid },
            featureFlagId: FeatureFlags.BillingPortal,
        });
        if (!enabled) {
            throw new ForbiddenError(UNAVAILABLE_MESSAGE);
        }

        const { licenseKey } = this.lightdashConfig.license;
        if (!licenseKey) {
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }

        const results = await this.requestPortalLink(
            organizationUuid,
            licenseKey,
        );
        this.analytics.track({
            event: 'billing_portal.link_created',
            userId: account.user.id,
            properties: { organizationId: organizationUuid },
        });
        return results;
    }

    private async requestPortalLink(
        organizationUuid: string,
        licenseKey: string,
    ): Promise<BillingPortalLinkResults> {
        // Control Center serves billing from the same origin as the roadmap.
        const url = new URL(
            `/api/v1/billing/organizations/${encodeURIComponent(organizationUuid)}/portal-link`,
            this.lightdashConfig.roadmap.baseUrl,
        );

        let response: Response;
        try {
            response = await fetch(url.toString(), {
                method: 'POST',
                redirect: 'manual',
                headers: { 'lightdash-license-key': licenseKey },
                signal: AbortSignal.timeout(BILLING_REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            this.logger.warn('Could not reach the billing service', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
            });
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }

        // The instance license is not bound to this organization.
        if (response.status === 401 || response.status === 403) {
            this.logger.warn('Billing service denied the request', {
                statusCode: response.status,
            });
            throw new ForbiddenError(UNAVAILABLE_MESSAGE);
        }
        if (response.status === 404) {
            throw new NotFoundError(
                'No billing account is linked to this organization',
            );
        }
        if (response.status !== 200) {
            this.logger.warn('Billing service returned an error', {
                statusCode: response.status,
            });
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }

        // The link is a credential: never log the payload.
        const parsed = BillingPortalLinkResponseSchema.safeParse(payload);
        if (!parsed.success) {
            this.logger.warn('Billing service returned an invalid response');
            throw new UnexpectedServerError(FAILURE_MESSAGE);
        }
        return parsed.data.results;
    }
}
