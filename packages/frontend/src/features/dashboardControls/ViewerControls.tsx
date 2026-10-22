import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import {
    Group,
    MultiSelect,
    SegmentedControl,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { IconAlertTriangle, IconLock, IconLockOpen } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    useDashboardSelector,
} from '../dashboard/store';
import { getFilterLockToggle } from '../dashboardFilters/ActiveFilters/filterLock';
import {
    getFilterRuleWithDisabledState,
    getFilterRuleWithRequired,
    isLockedRequiredMissingValue,
} from '../dashboardFilters/FilterConfiguration/utils';
import RequiredFilterCard from '../dashboardFilters/FilterRequirements/RequiredFilterCard';
import { isRuleRequired } from './requirements';
import { findFilterRule } from './sidebarState';

type LockScope = 'this' | 'all' | 'some';

const LOCK_SCOPES: { value: LockScope; label: string }[] = [
    { value: 'this', label: 'This tab' },
    { value: 'all', label: 'All tabs' },
    { value: 'some', label: 'Some tabs' },
];

type Props = {
    rule: DashboardFilterRule;
    filterType: FilterType;
    field: DashboardFilterableField | null;
    onChange: (next: DashboardFilterRule) => void;
    /** Writes the other filters a requirement change touches. */
    onChangeOthers: (rules: DashboardFilterRule[]) => void;
    /** Opens the bar's "Filter rules"; null when it cannot be reached. */
    onEditRules: (() => void) | null;
};

export const ViewerControls: FC<Props> = ({
    rule,
    filterType,
    field,
    onChange,
    onChangeOthers,
    onEditRules,
}) => {
    const { track } = useTracking();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const savedFilters = useDashboardContext((c) => c.dashboard?.filters);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    // Only "Some tabs" can be picked without changing the locked tabs
    const [isSomeTabsPicked, setIsSomeTabsPicked] = useState(false);

    // Lock
    const hasTabs = dashboardTabs.length > 0;
    // Dashboards without tabs store the dashboard uuid as a sentinel
    const lockKeys = hasTabs
        ? dashboardTabs.map((tab) => tab.uuid)
        : dashboardUuid
          ? [dashboardUuid]
          : [];
    const isLocked = (key: string) => isFilterLockedOnTab(rule, key, hasTabs);
    const lockedKeys = lockKeys.filter(isLocked);
    const isLockedSomewhere = lockedKeys.length > 0;
    // The switch locks what the pill's lock would: the tab in view
    const switchLockKey = hasTabs
        ? lockKeys.includes(activeTabUuid ?? '')
            ? activeTabUuid
            : lockKeys[0]
        : lockKeys[0];

    // The pill's lock, on the tab the key stands for: the next rule and the
    // event it tracks
    const getLockToggle = (from: DashboardFilterRule, key: string) =>
        getFilterLockToggle(from, {
            isLocked: isFilterLockedOnTab(from, key, hasTabs),
            hasTabs,
            activeTabUuid: hasTabs ? key : undefined,
            dashboardUuid,
        });
    // One pill lock per tab whose lock changes, each with its event
    const setLockedKeys = (target: string[]) => {
        const next = lockKeys.reduce((from, key) => {
            if (
                isFilterLockedOnTab(from, key, hasTabs) === target.includes(key)
            )
                return from;
            const toggle = getLockToggle(from, key);
            if (toggle === null) return from;
            track(toggle.event);
            return toggle.filterRule;
        }, rule);
        if (next !== rule) onChange(next);
    };
    const unlockEverywhere = () => {
        setIsSomeTabsPicked(false);
        lockedKeys.forEach((key) => {
            const toggle = getLockToggle(rule, key);
            if (toggle !== null) track(toggle.event);
        });
        onChange({ ...rule, lockedTabUuids: undefined });
    };
    // Unlocking is always allowed; locking is not when no viewer could then
    // satisfy the filter
    const isLockBlocked = (key: string) => {
        const toggle = isLocked(key) ? null : getLockToggle(rule, key);
        return (
            toggle !== null && isLockedRequiredMissingValue(toggle.filterRule)
        );
    };
    const isLockSwitchBlocked =
        !isLockedSomewhere &&
        switchLockKey !== undefined &&
        isLockBlocked(switchLockKey);
    const getScopeKeys = (scope: LockScope): string[] => {
        if (scope === 'all') return lockKeys;
        if (scope === 'this')
            return switchLockKey === undefined ? [] : [switchLockKey];
        return lockedKeys;
    };
    const isScopeBlocked = (scope: LockScope) =>
        getScopeKeys(scope).some(isLockBlocked);
    const derivedScope: LockScope =
        lockedKeys.length === 1 && lockedKeys[0] === switchLockKey
            ? 'this'
            : lockedKeys.length === lockKeys.length
              ? 'all'
              : 'some';
    const lockScope = isSomeTabsPicked ? 'some' : derivedScope;

    // Required, as the shipped form switches it
    const isRequired = isRuleRequired(rule);
    // The rule as the dashboard was last saved, as the shipped popover reads it
    const savedRule = savedFilters
        ? (findFilterRule(savedFilters, rule.id) ?? undefined)
        : undefined;
    const getRequiredRule = (checked: boolean) =>
        getFilterRuleWithDisabledState(
            getFilterRuleWithRequired(
                filterType,
                field ?? undefined,
                rule,
                savedRule,
                checked,
            ),
            true,
        );
    const isRequiredBlocked =
        !isRequired && isLockedRequiredMissingValue(getRequiredRule(true));

    return (
        <Stack gap="md">
            <Stack gap={6}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon
                            icon={isLockedSomewhere ? IconLock : IconLockOpen}
                            size="sm"
                            color={isLockedSomewhere ? 'ldGray.9' : 'dimmed'}
                        />
                        <Text fz="sm" fw={500}>
                            Lock
                        </Text>
                    </Group>
                    <Switch
                        size="xs"
                        aria-label="Lock"
                        checked={isLockedSomewhere}
                        disabled={
                            switchLockKey === undefined || isLockSwitchBlocked
                        }
                        onChange={(e) => {
                            if (!e.currentTarget.checked) unlockEverywhere();
                            else if (switchLockKey !== undefined) {
                                setIsSomeTabsPicked(false);
                                setLockedKeys([switchLockKey]);
                            }
                        }}
                    />
                </Group>
                <Text fz="xs" c="dimmed">
                    Viewers see the value but can&apos;t change it.
                </Text>
                {hasTabs && isLockedSomewhere && (
                    <>
                        <SegmentedControl
                            size="xs"
                            fullWidth
                            aria-label="Locked on"
                            value={lockScope}
                            data={LOCK_SCOPES.map((scope) => ({
                                ...scope,
                                disabled:
                                    scope.value !== lockScope &&
                                    isScopeBlocked(scope.value),
                            }))}
                            onChange={(value) => {
                                const scope = value as LockScope;
                                setIsSomeTabsPicked(scope === 'some');
                                setLockedKeys(getScopeKeys(scope));
                            }}
                        />
                        {lockScope === 'some' && (
                            <MultiSelect
                                size="xs"
                                aria-label="Locked tabs"
                                data={dashboardTabs.map((tab) => ({
                                    value: tab.uuid,
                                    label:
                                        tab.uuid === switchLockKey
                                            ? `${tab.name} · this tab`
                                            : tab.name,
                                    disabled: isLockBlocked(tab.uuid),
                                }))}
                                value={lockedKeys}
                                onChange={setLockedKeys}
                            />
                        )}
                    </>
                )}
                {isLockSwitchBlocked && (
                    <Group gap={6} wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconAlertTriangle}
                            size={14}
                            color="yellow.6"
                        />
                        <Text fz="xs" c="dimmed">
                            Give it a default value before locking it.
                        </Text>
                    </Group>
                )}
            </Stack>

            <RequiredFilterCard
                filterRule={rule}
                onToggleRequired={(checked) =>
                    onChange(getRequiredRule(checked))
                }
                onChangeFilterRule={(next) =>
                    onChange(getFilterRuleWithDisabledState(next, true))
                }
                onChangeOtherFilterRule={(other) => onChangeOthers([other])}
                onEditRules={onEditRules ?? undefined}
                disabledReason={
                    isRequiredBlocked
                        ? 'A locked filter needs a default value to be required.'
                        : undefined
                }
            />
        </Stack>
    );
};
