import {
    FilterOperator,
    FilterType,
    isFilterLockedOnTab,
    supportsSingleValue,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconChevronDown,
    IconEye,
    IconEyeOff,
    IconLock,
    IconLockOpen,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getFilterOperatorOptions } from '../../components/common/Filters/FilterInputs/utils';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useDashboardFilterField } from '../dashboardFilters/FilterRequirements/useDashboardFilterField';
import { getDashboardFilterRuleLabel } from '../dashboardFilters/FilterRequirements/utils';
import classes from './Interactivity.module.css';
import { NotSavedBadge } from './NotSavedBadge';
import {
    addAlternative,
    clearRequired,
    getAlternativeIds,
    getRequiredIneligibilityReason,
    isRuleRequired,
    removeAlternative,
    setRuleRequired,
} from './requirements';
import {
    isHiddenOnTab,
    isPickDefault,
    isWhoChanged,
    setTabUuids,
    toggleAllowedOperator,
    type SessionOperatorsMode,
    type SessionPicker,
    type SessionPlacement,
} from './sessionSettings';
import { useFilterSidebar } from './useFilterSidebar';

type RowKey = 'who' | 'required' | 'pick' | 'where';

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

const SessionLabel: FC<{ children: ReactNode }> = ({ children }) => (
    <Group gap="xs">
        <Text size="xs" fw={500}>
            {children}
        </Text>
        <NotSavedBadge />
    </Group>
);

export type InteractivitySubject =
    | {
          kind: 'filter';
          rule: DashboardFilterRule;
          /** Known from the rule's kind even before it has a field. */
          filterType: FilterType;
          onChange: (next: DashboardFilterRule) => void;
      }
    | { kind: 'control'; id: string };

const ALL_ROWS: RowKey[] = ['who', 'required', 'pick', 'where'];

type Props = {
    subject: InteractivitySubject;
    field: DashboardFilterableField | null;
    rows?: RowKey[];
};

export const InteractivityQuestions: FC<Props> = ({
    subject,
    field,
    rows = ALL_ROWS,
}) => {
    const { getSessionSettings, updateSessionSettings } = useFilterSidebar();
    const subjectId = subject.kind === 'filter' ? subject.rule.id : subject.id;
    const settings = getSessionSettings(subjectId);
    const patch = (next: Parameters<typeof updateSessionSettings>[1]) =>
        updateSessionSettings(subjectId, next);
    // A control has no saved rule; a placeholder keeps the filter-only rows typed
    const filterRule: DashboardFilterRule =
        subject.kind === 'filter'
            ? subject.rule
            : {
                  id: subject.id,
                  target: { fieldId: '', tableName: '' },
                  operator: FilterOperator.EQUALS,
                  label: undefined,
                  lockedTabUuids: settings.lockedTabUuids,
              };
    const onChange = (next: DashboardFilterRule) => {
        if (subject.kind === 'filter') subject.onChange(next);
    };
    const showRow = (key: RowKey) => rows.includes(key);

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
    const getUiString = useUiStrings();

    const [openRow, setOpenRow] = useState<RowKey | null>(null);
    const [isPerTab, setIsPerTab] = useState(false);
    const rowProps = (key: RowKey) => ({
        isOpen: openRow === key,
        onToggle: () => setOpenRow(openRow === key ? null : key),
    });

    // Who
    const hasTabs = dashboardTabs.length > 0;
    const tabUuids = useMemo(
        () => dashboardTabs.map((tab) => tab.uuid),
        [dashboardTabs],
    );
    // Dashboards without tabs store the dashboard uuid as a sentinel
    const everyTabKeys = hasTabs
        ? tabUuids
        : dashboardUuid
          ? [dashboardUuid]
          : [];
    const isLocked = (key: string) =>
        isFilterLockedOnTab(filterRule, key, hasTabs);
    const isHidden = (key: string) => isHiddenOnTab(settings, key);
    const tabsAgree =
        new Set(everyTabKeys.map((key) => `${isLocked(key)}${isHidden(key)}`))
            .size <= 1;
    const showPerTab = hasTabs && (isPerTab || !tabsAgree);

    const setLocked = (keys: string[], locked: boolean) => {
        const next = setTabUuids(filterRule.lockedTabUuids ?? [], keys, locked);
        if (subject.kind === 'control') {
            patch({ lockedTabUuids: next });
            return;
        }
        onChange({
            ...filterRule,
            lockedTabUuids: next.length > 0 ? next : undefined,
        });
    };
    const setHidden = (keys: string[], hidden: boolean) =>
        patch({
            hiddenTabUuids: setTabUuids(settings.hiddenTabUuids, keys, hidden),
        });

    const accessWord = (keys: string[]) =>
        keys.length > 0 && keys.every(isHidden)
            ? 'Hidden'
            : keys.length > 0 && keys.every(isLocked)
              ? 'Locked'
              : 'Viewers can change it';
    const whoSummary =
        hasTabs && !tabsAgree
            ? dashboardTabs
                  .map(
                      (tab) =>
                          `${tab.name}: ${accessWord([tab.uuid]).toLowerCase()}`,
                  )
                  .join(' · ')
            : `${accessWord(everyTabKeys)}${hasTabs ? ' on every tab' : ''}`;
    const canViewersChangeSomewhere = everyTabKeys.some(
        (key) => !isHidden(key) && !isLocked(key),
    );

    const whoLine = (name: string, keys: string[]) => {
        const hidden = keys.length > 0 && keys.every(isHidden);
        const locked = keys.length > 0 && keys.every(isLocked);
        const lockLabel = hidden
            ? 'Hidden filters cannot be changed by viewers'
            : locked
              ? 'Unlock filter'
              : 'Lock filter';
        const eyeLabel = hidden
            ? 'Hidden from viewers. Click to show.'
            : 'Visible to viewers. Click to hide.';
        return (
            <Group key={name} justify="space-between" wrap="nowrap">
                <Stack gap={0}>
                    <Text size="xs" truncate>
                        {name}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {accessWord(keys)}
                    </Text>
                </Stack>
                <Group gap="sm" wrap="nowrap">
                    <Group gap={4} wrap="nowrap">
                        <Tooltip label={lockLabel}>
                            <ActionIcon
                                size="sm"
                                variant={locked ? 'light' : 'subtle'}
                                color="gray"
                                disabled={hidden}
                                aria-label={lockLabel}
                                onClick={() => setLocked(keys, !locked)}
                            >
                                <MantineIcon
                                    icon={locked ? IconLock : IconLockOpen}
                                />
                            </ActionIcon>
                        </Tooltip>
                        {subject.kind === 'control' && <NotSavedBadge />}
                    </Group>
                    <Group gap={4} wrap="nowrap">
                        <Tooltip label={eyeLabel}>
                            <ActionIcon
                                size="sm"
                                variant={hidden ? 'light' : 'subtle'}
                                color="gray"
                                aria-label={eyeLabel}
                                onClick={() => setHidden(keys, !hidden)}
                            >
                                <MantineIcon
                                    icon={hidden ? IconEyeOff : IconEye}
                                />
                            </ActionIcon>
                        </Tooltip>
                        <NotSavedBadge />
                    </Group>
                </Group>
            </Group>
        );
    };

    // Required
    const allRules = useMemo(
        () => [
            ...dashboardFilters.dimensions,
            ...dashboardFilters.metrics,
            ...dashboardFilters.tableCalculations,
        ],
        [dashboardFilters],
    );
    const isRequired = isRuleRequired(filterRule);
    const alternativeIds = getAlternativeIds(allRules, filterRule.id);
    const requiredReason = getRequiredIneligibilityReason(filterRule, tabUuids);
    const writeRules = (next: DashboardFilterRule[]) => {
        const byId = new Map(next.map((rule) => [rule.id, rule]));
        const swap = (rules: DashboardFilterRule[]) =>
            rules.map((rule) => byId.get(rule.id) ?? rule);
        setDashboardFilters((filters) => ({
            dimensions: swap(filters.dimensions),
            metrics: swap(filters.metrics),
            tableCalculations: swap(filters.tableCalculations),
        }));
        setHaveFiltersChanged(true);
    };
    const alternativeLabels = allRules
        .filter((rule) => alternativeIds.includes(rule.id))
        .map((rule) => getDashboardFilterRuleLabel(rule, getField));
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
          : 'Remove the default value to require it';

    // Pick
    // A control has no operators or pickers; the string rows are never shown
    const filterType =
        subject.kind === 'filter' ? subject.filterType : FilterType.STRING;
    const operatorOptions = useMemo(
        () =>
            getFilterOperatorOptions(
                filterType,
                field ?? undefined,
                getUiString,
            ),
        [filterType, field, getUiString],
    );
    const pickerOptions: { value: SessionPicker; label: string }[] =
        filterType === FilterType.DATE
            ? [
                  { value: 'standard', label: 'Standard' },
                  { value: 'calendar', label: 'Calendar' },
                  { value: 'dataDates', label: 'Dates in data' },
              ]
            : [
                  { value: 'standard', label: 'Standard' },
                  { value: 'list', label: 'Ticked list' },
              ];
    const canBeSingle = supportsSingleValue(filterType, filterRule.operator);
    const pickerSummaries: Record<SessionPicker, string | null> = {
        standard: null,
        list: 'Ticked list',
        calendar: 'Calendar',
        dataDates: 'Dates in the data',
    };
    const pickerNotes: Record<SessionPicker, string | null> = {
        standard: null,
        list: 'Checklist with search and Select all.',
        calendar: 'Calendar with your presets.',
        dataDates: 'Dates present in the data, newest first.',
    };
    const onlyOperatorLabel =
        operatorOptions.find(
            (option) => option.value === settings.allowedOperators[0],
        )?.label ?? settings.allowedOperators[0];
    const operatorsSummary =
        settings.picker !== 'standard' || settings.operators === 'all'
            ? null
            : settings.operators === 'one' && onlyOperatorLabel
              ? `Only ${onlyOperatorLabel}`
              : `${settings.allowedOperators.length} operators`;
    const pickSummary =
        [
            pickerSummaries[settings.picker],
            operatorsSummary,
            filterRule.singleValue && settings.picker !== 'calendar'
                ? 'One value'
                : null,
            settings.hasBoundaries ? 'with boundaries' : null,
        ]
            .filter((part) => part !== null)
            .join(', ') || 'Any operator, several values';
    const boundariesSub = !settings.hasBoundaries
        ? 'None. Viewers can pick any value.'
        : filterType === FilterType.DATE
          ? 'Within the last 12 months'
          : 'Only the values you list';

    return (
        <Stack gap={0}>
            {showRow('who') && (
                <QuestionRow
                    label="Visibility"
                    summary={whoSummary}
                    isChanged={isWhoChanged(filterRule, settings)}
                    {...rowProps('who')}
                >
                    {showPerTab
                        ? dashboardTabs.map((tab) =>
                              whoLine(tab.name, [tab.uuid]),
                          )
                        : whoLine('Every tab', everyTabKeys)}
                    {hasTabs && !showPerTab && (
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
                    {isWhoChanged(filterRule, settings) && (
                        <Text size="xs" c="dimmed">
                            Still filters the tiles. URL and embed values are
                            ignored.
                        </Text>
                    )}
                </QuestionRow>
            )}

            {showRow('required') && (
                <QuestionRow
                    label="Required"
                    summary={requiredSummary}
                    isChanged={isRequired}
                    {...rowProps('required')}
                >
                    <Tooltip label={requiredReason} disabled={!requiredReason}>
                        <Checkbox
                            size="xs"
                            label="Required"
                            description={requiredSub}
                            checked={isRequired}
                            disabled={!isRequired && requiredReason !== null}
                            onChange={(e) =>
                                writeRules(
                                    e.currentTarget.checked
                                        ? [setRuleRequired(filterRule)]
                                        : clearRequired(
                                              allRules,
                                              filterRule.id,
                                          ),
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
                                .filter((rule) => rule.id !== filterRule.id)
                                .map((rule) => {
                                    const isAlternative =
                                        alternativeIds.includes(rule.id);
                                    const reason = isAlternative
                                        ? null
                                        : isRuleRequired(rule)
                                          ? 'Already required'
                                          : getRequiredIneligibilityReason(
                                                rule,
                                                tabUuids,
                                            );
                                    return (
                                        <Checkbox
                                            key={rule.id}
                                            size="xs"
                                            label={getDashboardFilterRuleLabel(
                                                rule,
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
                                                              filterRule.id,
                                                              rule.id,
                                                              uuidv4(),
                                                          )
                                                        : removeAlternative(
                                                              allRules,
                                                              rule.id,
                                                          ),
                                                )
                                            }
                                        />
                                    );
                                })}
                        </Stack>
                    )}
                </QuestionRow>
            )}

            {showRow('pick') && (
                <QuestionRow
                    label="Allowed values"
                    summary={pickSummary}
                    isChanged={
                        !isPickDefault(settings) || !!filterRule.singleValue
                    }
                    {...rowProps('pick')}
                >
                    {!canViewersChangeSomewhere && (
                        <Text size="xs" c="dimmed">
                            Not shown while viewers cannot change the filter.
                        </Text>
                    )}
                    <SessionLabel>Picker</SessionLabel>
                    <SegmentedControl
                        size="xs"
                        data={pickerOptions}
                        value={settings.picker}
                        onChange={(value) =>
                            patch({ picker: value as SessionPicker })
                        }
                    />
                    {pickerNotes[settings.picker] !== null && (
                        <Text size="xs" c="dimmed">
                            {pickerNotes[settings.picker]}
                        </Text>
                    )}
                    {settings.picker === 'standard' && (
                        <>
                            <SessionLabel>Operators</SessionLabel>
                            <SegmentedControl
                                size="xs"
                                data={[
                                    { value: 'all', label: 'All' },
                                    { value: 'some', label: 'Some' },
                                    { value: 'one', label: 'One' },
                                ]}
                                value={settings.operators}
                                onChange={(value) =>
                                    patch({
                                        operators:
                                            value as SessionOperatorsMode,
                                        allowedOperators: [filterRule.operator],
                                    })
                                }
                            />
                            {settings.operators !== 'all' &&
                                operatorOptions.map((option) => (
                                    <Checkbox
                                        key={option.value}
                                        size="xs"
                                        label={option.label}
                                        checked={settings.allowedOperators.includes(
                                            option.value,
                                        )}
                                        onChange={() =>
                                            patch(
                                                toggleAllowedOperator(
                                                    settings,
                                                    option.value,
                                                ),
                                            )
                                        }
                                    />
                                ))}
                        </>
                    )}
                    <Text size="xs" fw={500}>
                        Values
                    </Text>
                    <SegmentedControl
                        size="xs"
                        disabled={!canBeSingle}
                        data={[
                            { value: 'multiple', label: 'Multiple' },
                            { value: 'single', label: 'Single' },
                        ]}
                        value={filterRule.singleValue ? 'single' : 'multiple'}
                        onChange={(value) =>
                            onChange({
                                ...filterRule,
                                singleValue: value === 'single',
                            })
                        }
                    />
                    <Group justify="space-between" wrap="nowrap">
                        <Stack gap={0}>
                            <SessionLabel>Filter boundaries</SessionLabel>
                            <Text size="xs" c="dimmed">
                                {boundariesSub}
                            </Text>
                        </Stack>
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() =>
                                patch({
                                    hasBoundaries: !settings.hasBoundaries,
                                })
                            }
                        >
                            {settings.hasBoundaries ? 'Remove' : 'Set up'}
                        </Button>
                    </Group>
                </QuestionRow>
            )}

            {showRow('where') && (
                <QuestionRow
                    label="Placement"
                    summary={
                        settings.placement === 'bar'
                            ? 'On the bar'
                            : 'Under More'
                    }
                    isChanged={settings.placement !== 'bar'}
                    {...rowProps('where')}
                >
                    <SessionLabel>Placement</SessionLabel>
                    <SegmentedControl
                        size="xs"
                        data={[
                            { value: 'bar', label: 'On the bar' },
                            { value: 'more', label: 'Under More' },
                        ]}
                        value={settings.placement}
                        onChange={(value) =>
                            patch({ placement: value as SessionPlacement })
                        }
                    />
                </QuestionRow>
            )}
        </Stack>
    );
};
