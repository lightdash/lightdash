import { subject } from '@casl/ability';
import {
    AiCreditsPausedError,
    ForbiddenError,
    getAiCreditContractWindow,
    getAiCreditsPausedMessage,
    getCalendarMonthPeriod,
    type AiCreditContract,
    type AiCreditDailyUsage,
    type AiCreditPeriod,
    type AiCreditsPausedAudience,
    type AiCreditUsageBreakdown,
    type AiCreditUsageSummary,
    type SessionUser,
} from '@lightdash/common';
import { type AiKeyManagement } from '../../analytics/aiUsage';
import { BaseService } from '../../services/BaseService';
import { type AiCreditContractModel } from '../models/AiCreditContractModel';
import { type AiCreditHoldModel } from '../models/AiCreditHoldModel';
import {
    toBreakdownRows,
    type AiCreditUsageModel,
} from '../models/AiCreditUsageModel';

type Dependencies = {
    aiCreditUsageModel: Pick<
        AiCreditUsageModel,
        'summarize' | 'summarizeByDay'
    >;
    aiCreditContractModel: Pick<AiCreditContractModel, 'find'>;
    aiCreditHoldModel: Pick<AiCreditHoldModel, 'findActive' | 'findBlocking'>;
    siteUrl: string;
};

const AI_CREDITS_SETTINGS_PATH = '/generalSettings/aiCredits';

const getAiCreditsPausedAudience = ({
    isEmbedViewer,
    isOrgAdmin,
}: {
    isEmbedViewer: boolean;
    isOrgAdmin: boolean;
}): AiCreditsPausedAudience => {
    if (isEmbedViewer) return 'embedViewer';
    return isOrgAdmin ? 'admin' : 'member';
};

export class AiCreditService extends BaseService {
    private readonly aiCreditUsageModel: Pick<
        AiCreditUsageModel,
        'summarize' | 'summarizeByDay'
    >;

    private readonly aiCreditContractModel: Pick<AiCreditContractModel, 'find'>;

    private readonly aiCreditHoldModel: Pick<
        AiCreditHoldModel,
        'findActive' | 'findBlocking'
    >;

    private readonly siteUrl: string;

    constructor(dependencies: Dependencies) {
        super({ serviceName: 'AiCreditService' });
        this.aiCreditUsageModel = dependencies.aiCreditUsageModel;
        this.aiCreditContractModel = dependencies.aiCreditContractModel;
        this.aiCreditHoldModel = dependencies.aiCreditHoldModel;
        this.siteUrl = dependencies.siteUrl;
    }

    /**
     * Refuses a billable AI action while a hold pauses the organization. Runs once
     * at the start of an action; calls on the organization's own key are never paused.
     * The key is only resolved when a hold exists, so an unpaused action costs one query.
     */
    async assertAiCreditsAvailable({
        user,
        resolveKeyManagement,
        isEmbedViewer,
    }: {
        user: SessionUser;
        resolveKeyManagement: () => Promise<AiKeyManagement | null>;
        isEmbedViewer: boolean;
    }): Promise<void> {
        const { organizationUuid } = user;
        if (!organizationUuid) return;
        const hold =
            await this.aiCreditHoldModel.findBlocking(organizationUuid);
        if (hold === undefined) return;
        if ((await resolveKeyManagement()) !== 'lightdash-managed') return;

        const isOrgAdmin = this.createAuditedAbility(user).can(
            'manage',
            subject('Organization', { organizationUuid }),
        );
        // The settings page only exists while a contract is in force.
        const canOpenSettings =
            !isEmbedViewer &&
            isOrgAdmin &&
            (await this.findCurrentPeriod(organizationUuid, new Date()))
                .contractInForce !== undefined;
        const audience = getAiCreditsPausedAudience({
            isEmbedViewer,
            isOrgAdmin,
        });
        throw new AiCreditsPausedError({
            reason: hold.reason,
            message: getAiCreditsPausedMessage({
                reason: hold.reason,
                audience,
                settingsUrl: canOpenSettings
                    ? `${this.siteUrl}${AI_CREDITS_SETTINGS_PATH}`
                    : null,
            }),
        });
    }

    private assertCanViewOrganizationUsage(user: SessionUser): string {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }
        const isOrgAdmin = this.createAuditedAbility(user).can(
            'manage',
            subject('Organization', { organizationUuid }),
        );
        if (!isOrgAdmin) {
            throw new ForbiddenError(
                'Only organization admins can view AI usage',
            );
        }
        return organizationUuid;
    }

    // The contract window containing now, or the calendar month when no contract is in force.
    private async findCurrentPeriod(
        organizationUuid: string,
        now: Date,
    ): Promise<{
        period: AiCreditPeriod;
        contractInForce: AiCreditContract | undefined;
    }> {
        const contract =
            await this.aiCreditContractModel.find(organizationUuid);
        const window =
            contract === undefined
                ? null
                : getAiCreditContractWindow(contract, now);
        return {
            period: window ?? getCalendarMonthPeriod(now),
            contractInForce: window === null ? undefined : contract,
        };
    }

    async getOrganizationDailyUsage(
        user: SessionUser,
        breakdown: AiCreditUsageBreakdown,
        now: Date = new Date(),
    ): Promise<AiCreditDailyUsage> {
        const organizationUuid = this.assertCanViewOrganizationUsage(user);
        const { period } = await this.findCurrentPeriod(organizationUuid, now);
        return this.aiCreditUsageModel.summarizeByDay(
            organizationUuid,
            period,
            breakdown,
        );
    }

    async getOrganizationUsage(
        user: SessionUser,
        now: Date = new Date(),
    ): Promise<AiCreditUsageSummary> {
        const organizationUuid = this.assertCanViewOrganizationUsage(user);
        const { period, contractInForce } = await this.findCurrentPeriod(
            organizationUuid,
            now,
        );
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
                          allowanceMode: contractInForce.allowanceMode,
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
