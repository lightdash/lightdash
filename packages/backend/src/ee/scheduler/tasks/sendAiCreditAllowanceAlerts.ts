import {
    getAiCreditAllowanceAlertMessage,
    getAiCreditContractWindow,
    getErrorMessage,
    type AiCreditPeriod,
} from '@lightdash/common';
import { groupBy } from 'lodash';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import Logger from '../../../logging/logger';
import { type NotificationsModel } from '../../../models/NotificationsModel/NotificationsModel';
import { type OrganizationMemberProfileModel } from '../../../models/OrganizationMemberProfileModel';
import {
    type AiCreditAllowanceAlert,
    type AiCreditAllowanceAlertModel,
} from '../../models/AiCreditAllowanceAlertModel';
import {
    hasAllowance,
    type AiCreditContractModel,
} from '../../models/AiCreditContractModel';

export const AI_CREDITS_SETTINGS_PATH = '/generalSettings/aiCredits';

const BATCH_SIZE = 100;

type Dependencies = {
    allowanceAlertModel: Pick<
        AiCreditAllowanceAlertModel,
        'findUndelivered' | 'markDelivered'
    >;
    contractModel: Pick<AiCreditContractModel, 'find'>;
    organizationMemberProfileModel: Pick<
        OrganizationMemberProfileModel,
        'getOrganizationAdmins'
    >;
    notificationsModel: Pick<
        NotificationsModel,
        'createAiCreditAllowanceNotifications'
    >;
    analytics: Pick<LightdashAnalytics, 'track'>;
};

const highestThreshold = (
    alerts: AiCreditAllowanceAlert[],
): AiCreditAllowanceAlert =>
    alerts.reduce((highest, alert) =>
        alert.thresholdPercent > highest.thresholdPercent ? alert : highest,
    );

// The contract can change between the sink recording an alert and this sweep; only the current period and allowance alert.
const findCurrentPeriod = async (
    deps: Dependencies,
    alert: AiCreditAllowanceAlert,
    now: Date,
): Promise<AiCreditPeriod | null> => {
    const contract = await deps.contractModel.find(alert.organizationUuid);
    if (
        contract === undefined ||
        contract.uuid !== alert.contractUuid ||
        !hasAllowance(contract) ||
        contract.allowanceCredits !== alert.allowanceCredits
    ) {
        return null;
    }
    const period = getAiCreditContractWindow(contract, now);
    return period !== null &&
        period.periodStart.getTime() === alert.windowStart.getTime()
        ? period
        : null;
};

const notifyAdmins = async (
    deps: Dependencies,
    alert: AiCreditAllowanceAlert,
    period: AiCreditPeriod,
): Promise<void> => {
    const admins = (
        await deps.organizationMemberProfileModel.getOrganizationAdmins(
            alert.organizationUuid,
        )
    ).filter((admin) => admin.isActive);
    await deps.notificationsModel.createAiCreditAllowanceNotifications({
        userUuids: admins.map((admin) => admin.userUuid),
        alertUuid: alert.uuid,
        metadata: {
            thresholdPercent: alert.thresholdPercent,
            periodEnd: period.periodEnd.toISOString(),
        },
        message: getAiCreditAllowanceAlertMessage(alert.thresholdPercent),
        url: AI_CREDITS_SETTINGS_PATH,
    });
    deps.analytics.track({
        event: 'ai_credit_allowance_alert.sent',
        anonymousId: LightdashAnalytics.anonymousId,
        properties: {
            organizationId: alert.organizationUuid,
            thresholdPercent: alert.thresholdPercent,
            allowanceCredits: alert.allowanceCredits,
            usedCredits: alert.usedCredits,
            periodEnd: period.periodEnd.toISOString(),
            recipientCount: admins.length,
        },
    });
};

const deliverPeriodAlerts = async (
    deps: Dependencies,
    alerts: AiCreditAllowanceAlert[],
    now: Date,
): Promise<void> => {
    // Thresholds reached together (e.g. one large call) send one alert, for the highest.
    const alert = highestThreshold(alerts);
    const period = await findCurrentPeriod(deps, alert, now);
    if (period !== null) {
        await notifyAdmins(deps, alert, period);
    }
    await deps.allowanceAlertModel.markDelivered(
        alerts.map(({ uuid }) => uuid),
        now,
    );
};

export const sendAiCreditAllowanceAlerts =
    (deps: Dependencies) =>
    async (now: Date = new Date()): Promise<void> => {
        const pending =
            await deps.allowanceAlertModel.findUndelivered(BATCH_SIZE);
        const byPeriod = Object.values(
            groupBy(
                pending,
                (alert) =>
                    `${alert.contractUuid}:${alert.windowStart.toISOString()}`,
            ),
        );
        await byPeriod.reduce<Promise<void>>(async (previous, alerts) => {
            await previous;
            try {
                await deliverPeriodAlerts(deps, alerts, now);
            } catch (error) {
                Logger.error(
                    `Unable to send the AI credit allowance alert for organization ${alerts[0].organizationUuid}: ${getErrorMessage(error)}`,
                );
            }
        }, Promise.resolve());
    };
