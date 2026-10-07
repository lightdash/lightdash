import {
    isFilterLockedOnTab,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
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
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useDashboardFilterField } from '../dashboardFilters/FilterRequirements/useDashboardFilterField';
import { getDashboardFilterRuleLabel } from '../dashboardFilters/FilterRequirements/utils';
import classes from './FilterSettings.module.css';
import {
    addAlternative,
    clearRequired,
    getAlternativeIds,
    getRequiredIneligibilityReason,
    isRuleRequired,
    removeAlternative,
    setRuleRequired,
} from './requirements';
import { toggleFilterLockOnTab } from './sidebarState';

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
    onChange: (next: DashboardFilterRule) => void;
};

export const ViewerControls: FC<Props> = ({ rule, onChange }) => {
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
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

    const setLockedEverywhere = (locked: boolean) =>
        onChange(
            locked
                ? lockKeys
                      .filter((key) => !isLocked(key))
                      .reduce(
                          (next, key) =>
                              toggleFilterLockOnTab(next, key, hasTabs),
                          rule,
                      )
                : { ...rule, lockedTabUuids: undefined },
        );

    const everyTab = hasTabs ? ' on every tab' : '';
    const lockSummary = isLockedEverywhere
        ? `Locked${everyTab}`
        : isLockedSomewhere
          ? `Locked on ${lockedCount} of ${lockKeys.length} tabs`
          : `Viewers can change it${everyTab}`;

    // Required
    const savedRules = useMemo(
        () => [
            ...dashboardFilters.dimensions,
            ...dashboardFilters.metrics,
            ...dashboardFilters.tableCalculations,
        ],
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
    const requiredReason = getRequiredIneligibilityReason(rule, tabUuids);

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
                dimensions: swap(filters.dimensions),
                metrics: swap(filters.metrics),
                tableCalculations: swap(filters.tableCalculations),
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
        : requiredReason === null
          ? 'Not required'
          : `Cannot be required while ${requiredReason}`;
    const requiredSub = isRequired
        ? 'Viewers must set this filter to load the dashboard.'
        : requiredReason === null
          ? 'Viewers would have to set it before the tiles load'
          : requiredReason === 'it has a default value'
            ? 'Remove the default value to require it'
            : 'Unlock it on a tab to require it';

    return (
        <Stack gap={0}>
            <QuestionRow
                label="Viewers"
                summary={lockSummary}
                isChanged={isLockedSomewhere}
                {...rowProps('lock')}
            >
                <Switch
                    size="xs"
                    label={hasTabs ? 'Lock on every tab' : 'Lock'}
                    description="Viewers see the value but cannot change it"
                    checked={isLockedEverywhere}
                    disabled={lockKeys.length === 0}
                    onChange={(e) =>
                        setLockedEverywhere(e.currentTarget.checked)
                    }
                />
                {showPerTab && (
                    <Stack gap="xs" role="group" aria-label="Lock per tab">
                        {dashboardTabs.map((tab) => (
                            <Switch
                                key={tab.uuid}
                                size="xs"
                                label={tab.name}
                                checked={isLocked(tab.uuid)}
                                onChange={() =>
                                    onChange(
                                        toggleFilterLockOnTab(
                                            rule,
                                            tab.uuid,
                                            hasTabs,
                                        ),
                                    )
                                }
                            />
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
                    label={`Cannot be required while ${requiredReason}`}
                    disabled={isRequired || requiredReason === null}
                >
                    <Switch
                        size="xs"
                        label="Required"
                        description={requiredSub}
                        checked={isRequired}
                        disabled={!isRequired && requiredReason !== null}
                        onChange={(e) =>
                            writeRules(
                                e.currentTarget.checked
                                    ? [setRuleRequired(rule)]
                                    : clearRequired(allRules, rule.id),
                            )
                        }
                    />
                </Tooltip>
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
                                    : isRuleRequired(other)
                                      ? 'Already required'
                                      : getRequiredIneligibilityReason(
                                            other,
                                            tabUuids,
                                        );
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
