import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getAiCreditContractWindow,
    getCalendarMonthPeriod,
    type AiCreditUsageSummary,
    type SessionUser,
} from '@lightdash/common';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../../services/BaseService';
import { type AiCreditContractModel } from '../models/AiCreditContractModel';
import { type AiCreditHoldModel } from '../models/AiCreditHoldModel';
import {
    toBreakdownRows,
    type AiCreditUsageModel,
} from '../models/AiCreditUsageModel';

type Dependencies = {
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    aiCreditUsageModel: Pick<AiCreditUsageModel, 'summarize'>;
    aiCreditContractModel: Pick<AiCreditContractModel, 'find'>;
    aiCreditHoldModel: Pick<AiCreditHoldModel, 'findActive'>;
};

export class AiCreditService extends BaseService {
    private readonly featureFlagModel: Pick<FeatureFlagModel, 'get'>;

    private readonly aiCreditUsageModel: Pick<AiCreditUsageModel, 'summarize'>;

    private readonly aiCreditContractModel: Pick<AiCreditContractModel, 'find'>;

    private readonly aiCreditHoldModel: Pick<AiCreditHoldModel, 'findActive'>;

    constructor(dependencies: Dependencies) {
        super({ serviceName: 'AiCreditService' });
        this.featureFlagModel = dependencies.featureFlagModel;
        this.aiCreditUsageModel = dependencies.aiCreditUsageModel;
        this.aiCreditContractModel = dependencies.aiCreditContractModel;
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

        const contract =
            await this.aiCreditContractModel.find(organizationUuid);
        const window =
            contract === undefined
                ? null
                : getAiCreditContractWindow(contract, now);
        const contractInForce = window === null ? undefined : contract;
        const period = window ?? getCalendarMonthPeriod(now);
        const [usage, activeHolds] = await Promise.all([
            this.aiCreditUsageModel.summarize(organizationUuid, period),
            this.aiCreditHoldModel.findActive(organizationUuid, now),
        ]);
        return {
            period,
            contract:
                contractInForce === undefined
                    ? null
                    : {
                          uuid: contractInForce.uuid,
                          startsAt: contractInForce.startsAt,
                          endsAt: contractInForce.endsAt,
                          resetIntervalMonths:
                              contractInForce.resetIntervalMonths,
                          allowanceCredits: contractInForce.allowanceCredits,
                      },
            // This service is only registered on an instance with a valid licence.
            canShowCredits: contractInForce !== undefined,
            billable: usage.billable,
            selfManaged: usage.selfManaged,
            excluded: usage.excluded,
            unpricedTokens: usage.unpricedTokens,
            byFeature: toBreakdownRows(usage.byFeature),
            byTier: toBreakdownRows(usage.byTier),
            byChannel: toBreakdownRows(usage.byChannel),
            byKeyOrigin: toBreakdownRows(usage.byKeyOrigin),
            activeHolds,
        };
    }
}
