export const AI_CREDIT_ALLOWANCE_ALERT_THRESHOLDS = [50, 80, 100] as const;

export type AiCreditAllowanceAlertThreshold =
    (typeof AI_CREDIT_ALLOWANCE_ALERT_THRESHOLDS)[number];

export type AiCreditAllowanceAlertRecord = {
    thresholdPercent: AiCreditAllowanceAlertThreshold;
    allowanceCredits: number;
};

export type AiCreditAllowanceAlertPlan = {
    reached: AiCreditAllowanceAlertThreshold[];
    // Recorded against an older allowance and no longer reached, so they may alert again.
    rearmed: AiCreditAllowanceAlertThreshold[];
    // Recorded against an older allowance and still reached: kept silent, moved to the current allowance.
    carriedOver: AiCreditAllowanceAlertThreshold[];
};

export const isAiCreditThresholdReached = (
    threshold: AiCreditAllowanceAlertThreshold,
    usedCredits: number,
    allowanceCredits: number,
): boolean => usedCredits * 100 >= allowanceCredits * threshold;

/** True when no threshold can change, so the period's usage need not be summed. */
export const isAiCreditAllowanceAlertPlanSettled = (
    records: AiCreditAllowanceAlertRecord[],
    allowanceCredits: number,
): boolean =>
    AI_CREDIT_ALLOWANCE_ALERT_THRESHOLDS.every((threshold) =>
        records.some(
            (record) =>
                record.thresholdPercent === threshold &&
                record.allowanceCredits === allowanceCredits,
        ),
    );

export const planAiCreditAllowanceAlerts = ({
    usedCredits,
    allowanceCredits,
    records,
}: {
    usedCredits: number;
    allowanceCredits: number;
    records: AiCreditAllowanceAlertRecord[];
}): AiCreditAllowanceAlertPlan =>
    AI_CREDIT_ALLOWANCE_ALERT_THRESHOLDS.reduce<AiCreditAllowanceAlertPlan>(
        (plan, threshold) => {
            const isReached = isAiCreditThresholdReached(
                threshold,
                usedCredits,
                allowanceCredits,
            );
            const record = records.find(
                (r) => r.thresholdPercent === threshold,
            );
            if (record === undefined) {
                return isReached
                    ? { ...plan, reached: [...plan.reached, threshold] }
                    : plan;
            }
            if (record.allowanceCredits === allowanceCredits) return plan;
            return isReached
                ? { ...plan, carriedOver: [...plan.carriedOver, threshold] }
                : { ...plan, rearmed: [...plan.rearmed, threshold] };
        },
        { reached: [], rearmed: [], carriedOver: [] },
    );

export const getAiCreditAllowanceAlertMessage = (
    threshold: AiCreditAllowanceAlertThreshold,
): string => `Reached ${threshold}% of your AI credit allowance`;
