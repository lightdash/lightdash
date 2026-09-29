import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getCalendarMonthPeriod,
    type AiCreditEntitlement,
    type AiCreditPeriod,
    type AiCreditUsageSummary,
    type SessionUser,
} from '@lightdash/common';
import { type LightdashConfig } from '../../config/parseConfig';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../../services/BaseService';
import { type AiCreditEntitlementModel } from '../models/AiCreditEntitlementModel';
import { type AiCreditHoldModel } from '../models/AiCreditHoldModel';
import {
    toBreakdownRows,
    type AiCreditUsageModel,
} from '../models/AiCreditUsageModel';

type Dependencies = {
    lightdashConfig: Pick<LightdashConfig, 'license'>;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    aiCreditUsageModel: Pick<AiCreditUsageModel, 'summarize' | 'sumCredits'>;
    aiCreditEntitlementModel: Pick<AiCreditEntitlementModel, 'findCovering'>;
    aiCreditHoldModel: Pick<AiCreditHoldModel, 'findActive'>;
};

const durationMs = (period: AiCreditPeriod): number =>
    period.periodEnd.getTime() - period.periodStart.getTime();

const samePeriod = (a: AiCreditPeriod, b: AiCreditPeriod): boolean =>
    a.periodStart.getTime() === b.periodStart.getTime() &&
    a.periodEnd.getTime() === b.periodEnd.getTime();

/**
 * The period the card reports on. With overlapping entitlements, such as a
 * monthly reset inside an annual pool, the shortest one is what an admin
 * watches day to day.
 */
export const selectReportingPeriod = (
    entitlements: AiCreditEntitlement[],
    now: Date,
): AiCreditPeriod =>
    entitlements.reduce<AiCreditPeriod | null>(
        (shortest, entitlement) =>
            shortest === null || durationMs(entitlement) < durationMs(shortest)
                ? entitlement
                : shortest,
        null,
    ) ?? getCalendarMonthPeriod(now);

export class AiCreditService extends BaseService {
    private readonly lightdashConfig: Pick<LightdashConfig, 'license'>;

    private readonly featureFlagModel: Pick<FeatureFlagModel, 'get'>;

    private readonly aiCreditUsageModel: Pick<
        AiCreditUsageModel,
        'summarize' | 'sumCredits'
    >;

    private readonly aiCreditEntitlementModel: Pick<
        AiCreditEntitlementModel,
        'findCovering'
    >;

    private readonly aiCreditHoldModel: Pick<AiCreditHoldModel, 'findActive'>;

    constructor(dependencies: Dependencies) {
        super({ serviceName: 'AiCreditService' });
        this.lightdashConfig = dependencies.lightdashConfig;
        this.featureFlagModel = dependencies.featureFlagModel;
        this.aiCreditUsageModel = dependencies.aiCreditUsageModel;
        this.aiCreditEntitlementModel = dependencies.aiCreditEntitlementModel;
        this.aiCreditHoldModel = dependencies.aiCreditHoldModel;
    }

    private async assertCanViewUsage(
        user: SessionUser,
        organizationUuid: string,
    ): Promise<void> {
        const isOrgAdmin = this.createAuditedAbility(user).can(
            'manage',
            subject('Organization', { organizationUuid }),
        );
        if (!isOrgAdmin) {
            throw new ForbiddenError(
                'Only organization admins can view AI usage',
            );
        }
        const flag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.AiCredits,
        });
        if (!flag.enabled) {
            throw new ForbiddenError(
                'AI usage in credits is not enabled for this organization',
            );
        }
    }

    async getOrganizationUsage(
        user: SessionUser,
        now: Date = new Date(),
    ): Promise<AiCreditUsageSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }
        await this.assertCanViewUsage(user, organizationUuid);

        const entitlements = await this.aiCreditEntitlementModel.findCovering(
            organizationUuid,
            now,
        );
        const period = selectReportingPeriod(entitlements, now);
        const [usage, activeHolds] = await Promise.all([
            this.aiCreditUsageModel.summarize(organizationUuid, period),
            this.aiCreditHoldModel.findActive(organizationUuid, now),
        ]);
        const entitlementUsage = await Promise.all(
            entitlements.map(async (entitlement) => ({
                uuid: entitlement.uuid,
                periodStart: entitlement.periodStart,
                periodEnd: entitlement.periodEnd,
                allowanceCredits: entitlement.allowanceCredits,
                usedCredits: samePeriod(entitlement, period)
                    ? usage.billable.credits
                    : await this.aiCreditUsageModel.sumCredits(
                          organizationUuid,
                          entitlement,
                      ),
            })),
        );
        return {
            period: {
                periodStart: period.periodStart,
                periodEnd: period.periodEnd,
            },
            entitlements: entitlementUsage,
            canShowCredits:
                this.lightdashConfig.license.licenseKey !== null &&
                entitlements.length > 0,
            billable: usage.billable,
            selfManaged: usage.selfManaged,
            excluded: usage.excluded,
            unpricedTokens: usage.unpricedTokens,
            byFeature: toBreakdownRows(usage.byFeature),
            byTier: toBreakdownRows(usage.byTier),
            byKeyOrigin: toBreakdownRows(usage.byKeyOrigin),
            activeHolds,
        };
    }
}
