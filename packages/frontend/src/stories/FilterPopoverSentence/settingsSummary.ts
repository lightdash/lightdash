import {
    isValuelessDashboardFilterRule,
    type DashboardControlSection,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTab,
} from '@lightdash/common';
import { hasFilterValueSet } from '../../features/dashboardFilters/FilterConfiguration/utils';

// The lock and required summaries of the rail's Settings row, as they shipped
// in `dashboardControls/railSummaries.ts` before the popover replaced the rail

type LockState =
    | { hasTabs: false; isLocked: boolean }
    | { hasTabs: true; lockedTabNames: string[]; tabCount: number };

const getLockSummary = (lock: LockState): string | null => {
    if (!lock.hasTabs) return lock.isLocked ? 'Locked' : null;
    const { lockedTabNames, tabCount } = lock;
    if (lockedTabNames.length === 0) return null;
    if (lockedTabNames.length === tabCount) return 'Locked';
    if (lockedTabNames.length === 1) return `Locked on ${lockedTabNames[0]}`;
    return `Locked on ${lockedTabNames.length} tabs`;
};

const getRequiredSummary = (
    isRequired: boolean,
    alternativeLabels: string[],
): string | null => {
    if (!isRequired) return null;
    return alternativeLabels.length > 0
        ? `Required, or ${alternativeLabels.join(' or ')}`
        : 'Required';
};

const allRules = (filters: DashboardFilters) => [
    ...filters.dimensions,
    ...filters.metrics,
];

/** Section, single value, required and lock, joined; null when none is set. */
export const getSettingsSummary = ({
    rule,
    filters,
    tabs,
    sections,
    singleValue,
    getRuleName,
}: {
    rule: DashboardFilterRule;
    filters: DashboardFilters;
    tabs: DashboardTab[];
    sections: DashboardControlSection[];
    /** "Single value" when the filter takes one value. */
    singleValue: string | null;
    getRuleName: (other: DashboardFilterRule) => string;
}): string | null => {
    const section = sections.find(({ id }) => id === rule.sectionId);
    const alternatives = rule.requiredGroupId
        ? allRules(filters).filter(
              (other) =>
                  other.id !== rule.id &&
                  other.requiredGroupId === rule.requiredGroupId,
          )
        : [];
    const lockedTabUuids = rule.lockedTabUuids ?? [];
    const parts = [
        section ? section.name : null,
        singleValue,
        getRequiredSummary(
            !!rule.required || !!rule.requiredGroupId,
            alternatives.map(getRuleName),
        ),
        getLockSummary(
            tabs.length > 0
                ? {
                      hasTabs: true,
                      lockedTabNames: tabs
                          .filter((tab) => lockedTabUuids.includes(tab.uuid))
                          .map((tab) => tab.name),
                      tabCount: tabs.length,
                  }
                : { hasTabs: false, isLocked: lockedTabUuids.length > 0 },
        ),
    ].filter((part) => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
};

// As `useApplyBlockedReason`: `required` wins over a group, and a group is met
// by another member that filters (enabled, with a value)
export const isMissingRequiredValue = (
    rule: DashboardFilterRule,
    filters: DashboardFilters,
): boolean => {
    if (hasFilterValueSet(rule)) return false;
    if (rule.required) return true;
    if (!rule.requiredGroupId) return false;
    return !allRules(filters).some(
        (other) =>
            other.id !== rule.id &&
            !other.required &&
            other.requiredGroupId === rule.requiredGroupId &&
            !isValuelessDashboardFilterRule(other),
    );
};
