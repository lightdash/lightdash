import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Group,
    Stack,
    Switch,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { getFilterLockToggle } from '../dashboardFilters/ActiveFilters/filterLock';
import { useDashboardFilterField } from '../dashboardFilters/FilterRequirements/useDashboardFilterField';
import {
    getDashboardFilterRuleLabel,
    getRequirementIneligibilityReason,
} from '../dashboardFilters/FilterRequirements/utils';
import classes from './FilterSettings.module.css';
import {
    addAlternative,
    clearRuleRequired,
    getAlternativeIds,
    isLockedRequiredMissingValue,
    isRuleRequired,
    removeAlternative,
    setRuleRequired,
} from './requirements';
import { findFilterRule } from './sidebarState';

type RowKey = 'lock' | 'required';

type RowProps = {
    label: string;
    summary: string;
    isChanged: boolean;
    isOpen: boolean;
    onToggle: () => void;
    children: ReactNode;
};

const QuestionRow: FC<RowProps> = ({
    label,
    summary,
    isChanged,
    isOpen,
    onToggle,
    children,
}) => (
    <Stack gap={0} className={classes.row}>
        <UnstyledButton
            className={classes.rowHeader}
            aria-expanded={isOpen}
            onClick={onToggle}
        >
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={0}>
                    <Text size="xs" fw={isChanged ? 600 : 500}>
                        {label}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {summary}
                    </Text>
                </Stack>
                <MantineIcon
                    icon={IconChevronDown}
                    size={14}
                    color="dimmed"
                    className={`${classes.chevron} ${
                        isOpen ? classes.chevronOpen : ''
                    }`}
                />
            </Group>
        </UnstyledButton>
        {isOpen && (
            <Stack gap="xs" mt="xs">
                {children}
            </Stack>
        )}
    </Stack>
);

type Props = {
    rule: DashboardFilterRule;
    filterType: FilterType;
    field: DashboardFilterableField | null;
    onChange: (next: DashboardFilterRule) => void;
    /** Opens the bar's "Filter rules"; null when it cannot be reached. */
    onEditRules: (() => void) | null;
};

export const ViewerControls: FC<Props> = ({
    rule,
    filterType,
    field,
    onChange,
    onEditRules,
}) => {
    const getUiString = useUiStrings();
    const { track } = useTracking();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const savedFilters = useDashboardContext((c) => c.dashboard?.filters);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const getField = useDashboardFilterField();

    const [openRow, setOpenRow] = useState<RowKey | null>(null);
    const [isPerTab, setIsPerTab] = useState(false);
    const rowProps = (key: RowKey) => ({
        isOpen: openRow === key,
        onToggle: () => setOpenRow(openRow === key ? null : key),
    });

    // Lock
    const hasTabs = dashboardTabs.length > 0;
    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    // Dashboards without tabs store the dashboard uuid as a sentinel
    const lockKeys = hasTabs ? tabUuids : dashboardUuid ? [dashboardUuid] : [];
    const isLocked = (key: string) => isFilterLockedOnTab(rule, key, hasTabs);
    const lockedCount = lockKeys.filter(isLocked).length;
    const isLockedEverywhere =
        lockKeys.length > 0 && lockedCount === lockKeys.length;
    const isLockedSomewhere = lockedCount > 0;
    const showPerTab =
        dashboardTabs.length > 1 &&
        (isPerTab || (isLockedSomewhere && !isLockedEverywhere));

    // The pill's lock, on the tab the key stands for: the next rule and the
    // event it tracks
    const getLockToggle = (from: DashboardFilterRule, key: string) =>
        getFilterLockToggle(from, {
            isLocked: isFilterLockedOnTab(from, key, hasTabs),
            hasTabs,
            activeTabUuid: hasTabs ? key : undefined,
            dashboardUuid,
        });
    const toggleLock = (key: string) => {
        const toggle = getLockToggle(rule, key);
        if (toggle === null) return;
        track(toggle.event);
        onChange(toggle.filterRule);
    };
    const lockedEverywhereRule = lockKeys
        .filter((key) => !isLocked(key))
        .reduce(
            (next, key) => getLockToggle(next, key)?.filterRule ?? next,
            rule,
        );
    // One event per tab whose lock changes, as if each pill lock was clicked
    const setLockedEverywhere = (locked: boolean) => {
        lockKeys
            .filter((key) => isLocked(key) !== locked)
            .forEach((key) => {
                const toggle = getLockToggle(rule, key);
                if (toggle !== null) track(toggle.event);
            });
        onChange(
            locked
                ? lockedEverywhereRule
                : { ...rule, lockedTabUuids: undefined },
        );
    };
    // Unlocking is always allowed; locking is not when no viewer could then
    // satisfy the filter
    const lockedRequiredMessage = getUiString(
        'filters.config.applyLockedRequiredTooltip',
    );
    const isLockEverywhereBlocked =
        !isLockedEverywhere &&
        isLockedRequiredMissingValue(lockedEverywhereRule);
    const isLockBlocked = (key: string) => {
        const toggle = isLocked(key) ? null : getLockToggle(rule, key);
        return (
            toggle !== null && isLockedRequiredMissingValue(toggle.filterRule)
        );
    };

    const everyTab = hasTabs ? ' on every tab' : '';
    const lockSummary = isLockedEverywhere
        ? `Locked${everyTab}`
        : isLockedSomewhere
          ? `Locked on ${lockedCount} of ${lockKeys.length} tabs`
          : `Viewers can change it${everyTab}`;

    // Required: rules are over dimensions and metrics, as in the shipped card
    const savedRules = useMemo(
        () => [...dashboardFilters.dimensions, ...dashboardFilters.metrics],
        [dashboardFilters],
    );
    // The rule being edited may be ahead of, or missing from, the saved filters
    const allRules = useMemo(
        () =>
            savedRules.some((saved) => saved.id === rule.id)
                ? savedRules.map((saved) =>
                      saved.id === rule.id ? rule : saved,
                  )
                : [...savedRules, rule],
        [savedRules, rule],
    );
    const isRequired = isRuleRequired(rule);
    const alternativeIds = getAlternativeIds(allRules, rule.id);
    // The rule as the dashboard was last saved, as the shipped popover reads it
    const savedRule = savedFilters
        ? findFilterRule(savedFilters, rule.id)
        : null;
    const requiredRule = setRuleRequired(rule, savedRule);
    const isRequiredBlocked =
        !isRequired && isLockedRequiredMissingValue(requiredRule);

    // This rule goes through onChange; the other filters are written directly
    const writeRules = (next: DashboardFilterRule[]) => {
        const previousById = new Map(allRules.map((r) => [r.id, r]));
        const changed = next.filter((r) => previousById.get(r.id) !== r);
        const others = new Map(
            changed.filter((r) => r.id !== rule.id).map((r) => [r.id, r]),
        );
        if (others.size > 0) {
            const swap = (rules: DashboardFilterRule[]) =>
                rules.map((r) => others.get(r.id) ?? r);
            setDashboardFilters((filters) => ({
                ...filters,
                dimensions: swap(filters.dimensions),
                metrics: swap(filters.metrics),
            }));
            setHaveFiltersChanged(true);
        }
        const own = changed.find((r) => r.id === rule.id);
        if (own) onChange(own);
    };

    const alternativeLabels = allRules
        .filter((other) => alternativeIds.includes(other.id))
        .map((other) => getDashboardFilterRuleLabel(other, getField));
    const requiredSummary = isRequired
        ? alternativeLabels.length > 0
            ? `Required, or ${alternativeLabels.join(' or ')}`
            : 'Required'
        : 'Not required';
    const requiredSub = isRequired
        ? 'Viewers must set this filter to load the dashboard.'
        : 'Viewers would have to set it before the tiles load';

    return (
        <Stack gap={0}>
            <QuestionRow
                label="Viewers"
                summary={lockSummary}
                isChanged={isLockedSomewhere}
                {...rowProps('lock')}
            >
                <Tooltip
                    label={lockedRequiredMessage}
                    disabled={!isLockEverywhereBlocked}
                >
                    <Box w="max-content">
                        <Switch
                            size="xs"
                            label={hasTabs ? 'Lock on every tab' : 'Lock'}
                            description="Viewers see the value but cannot change it"
                            checked={isLockedEverywhere}
                            disabled={
                                lockKeys.length === 0 || isLockEverywhereBlocked
                            }
                            onChange={(e) =>
                                setLockedEverywhere(e.currentTarget.checked)
                            }
                        />
                    </Box>
                </Tooltip>
                {showPerTab && (
                    <Stack gap="xs" role="group" aria-label="Lock per tab">
                        {dashboardTabs.map((tab) => (
                            <Tooltip
                                key={tab.uuid}
                                label={lockedRequiredMessage}
                                disabled={!isLockBlocked(tab.uuid)}
                            >
                                <Box w="max-content">
                                    <Switch
                                        size="xs"
                                        label={tab.name}
                                        checked={isLocked(tab.uuid)}
                                        disabled={isLockBlocked(tab.uuid)}
                                        onChange={() => toggleLock(tab.uuid)}
                                    />
                                </Box>
                            </Tooltip>
                        ))}
                    </Stack>
                )}
                {dashboardTabs.length > 1 && !showPerTab && (
                    <Group gap="xs">
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => setIsPerTab(true)}
                        >
                            Set per tab
                        </Button>
                    </Group>
                )}
                {isLockedSomewhere && (
                    <Text size="xs" c="dimmed">
                        Still filters the tiles. URL and embed values are
                        ignored.
                    </Text>
                )}
            </QuestionRow>

            <QuestionRow
                label="Required"
                summary={requiredSummary}
                isChanged={isRequired}
                {...rowProps('required')}
            >
                <Tooltip
                    label={lockedRequiredMessage}
                    disabled={!isRequiredBlocked}
                >
                    <Box w="max-content">
                        <Switch
                            size="xs"
                            label="Required"
                            description={requiredSub}
                            checked={isRequired}
                            disabled={isRequiredBlocked}
                            onChange={(e) =>
                                onChange(
                                    e.currentTarget.checked
                                        ? requiredRule
                                        : clearRuleRequired(
                                              rule,
                                              filterType,
                                              field,
                                          ),
                                )
                            }
                        />
                    </Box>
                </Tooltip>
                {alternativeIds.length > 0 && onEditRules !== null && (
                    <Group gap="xs">
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={onEditRules}
                        >
                            Edit rule →
                        </Button>
                    </Group>
                )}
                {isRequired && allRules.length > 1 && (
                    <Stack gap="xs">
                        <Text size="xs" fw={500}>
                            Or one of these instead
                        </Text>
                        {allRules
                            .filter((other) => other.id !== rule.id)
                            .map((other) => {
                                const isAlternative = alternativeIds.includes(
                                    other.id,
                                );
                                const reason = isAlternative
                                    ? null
                                    : getRequirementIneligibilityReason(other);
                                return (
                                    <Checkbox
                                        key={other.id}
                                        size="xs"
                                        label={getDashboardFilterRuleLabel(
                                            other,
                                            getField,
                                        )}
                                        description={reason}
                                        disabled={reason !== null}
                                        checked={isAlternative}
                                        onChange={(e) =>
                                            writeRules(
                                                e.currentTarget.checked
                                                    ? addAlternative(
                                                          allRules,
                                                          rule.id,
                                                          other.id,
                                                          uuidv4(),
                                                      )
                                                    : removeAlternative(
                                                          allRules,
                                                          other.id,
                                                      ),
                                            )
                                        }
                                    />
                                );
                            })}
                    </Stack>
                )}
            </QuestionRow>
        </Stack>
    );
};
