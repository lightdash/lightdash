import {
    DimensionType,
    getFilterTypeFromItem,
    getFilterTypeFromItemType,
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
    type FilterableItem,
    type WeekDay,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    CloseButton,
    Collapse,
    Divider,
    Group,
    Paper,
    Progress,
    ScrollArea,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCircleDashed,
    IconFilterExclamation,
} from '@tabler/icons-react';
import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import FilterInputComponent from '../../../components/common/Filters/FilterInputs';
import { getConditionalRuleLabelFromItem } from '../../../components/common/Filters/FilterInputs/utils';
import FiltersProvider from '../../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../../components/common/MantineIcon';
import TruncatedText from '../../../components/common/TruncatedText';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { hasFilterValueSet } from '../FilterConfiguration/utils';
import classes from './GuidedFilterSetup.module.css';
import { AndSeparator, OrSeparator } from './RuleSeparators';
import { useFilterableItemsMap } from './useFilterableItemsMap';
import {
    getDashboardFilterRuleLabel,
    getFilterRequirementRules,
    isRequirementRuleSatisfied,
    type FilterRequirementRule,
} from './utils';

const RuleStatusIcon: FC<{ satisfied: boolean }> = ({ satisfied }) =>
    satisfied ? (
        <ThemeIcon size={16} radius="xl" color="green" variant="filled">
            <MantineIcon icon={IconCheck} size={10} />
        </ThemeIcon>
    ) : (
        <MantineIcon icon={IconCircleDashed} size={16} color="ldGray.5" />
    );

type MemberInputProps = {
    member: DashboardFilterRule;
    field: FilterableItem | undefined;
    label: string;
    /** Multi-member rules label each row; single rules are labeled by the rule heading */
    showLabel: boolean;
    popoverProps: {
        withinPortal: boolean;
        onOpen?: () => void;
        onClose?: () => void;
    };
    onChange: (newRule: DashboardFilterRule) => void;
};

const MemberInput: FC<MemberInputProps> = ({
    member,
    field,
    label,
    showLabel,
    popoverProps,
    onChange,
}) => (
    <Group gap="xs" wrap="nowrap">
        {showLabel && (
            <TruncatedText maxWidth={90} w={90} fz="xs" c="ldGray.6">
                {label}
            </TruncatedText>
        )}
        <Box flex={1} miw={0}>
            <FilterInputComponent
                filterType={
                    field
                        ? getFilterTypeFromItem(field)
                        : getFilterTypeFromItemType(
                              member.target.fallbackType ??
                                  DimensionType.STRING,
                          )
                }
                field={field}
                rule={member}
                popoverProps={popoverProps}
                onChange={(newRule) => onChange(newRule as DashboardFilterRule)}
            />
        </Box>
    </Group>
);

type RuleSummaryProps = {
    rule: FilterRequirementRule;
    fieldsMap: Record<string, FilterableItem>;
    onChange: () => void;
};

const RuleSummary: FC<RuleSummaryProps> = ({ rule, fieldsMap, onChange }) => {
    // Same test as isRequirementRuleSatisfied, so the summary always shows
    // the member that actually satisfies the rule
    const setMember = rule.members.find(
        (member) => !isValuelessDashboardFilterRule(member),
    );
    if (!setMember) return null;

    const field = fieldsMap[setMember.target.fieldId];
    const valueLabel = field
        ? getConditionalRuleLabelFromItem(setMember, field).value
        : undefined;

    return (
        <Group gap="xs" wrap="nowrap" className={classes.summaryRow}>
            <RuleStatusIcon satisfied />
            <Text size="xs" fw={500} truncate>
                {getDashboardFilterRuleLabel(setMember, fieldsMap)}
            </Text>
            <Text size="xs" c="dimmed" truncate flex={1}>
                {valueLabel}
            </Text>
            <Anchor
                component="button"
                type="button"
                size="xs"
                onClick={onChange}
            >
                Change
            </Anchor>
        </Group>
    );
};

type Props = {
    onDismiss: () => void;
    startOfWeek?: WeekDay;
    /** Report nested filter dropdown state, like the chip popovers do */
    onSubPopoverOpen?: () => void;
    onSubPopoverClose?: () => void;
};

/**
 * Viewer-facing setup card shown over the locked grid while filter
 * requirements are unmet: every rule gets a real value picker (same state as
 * the filter bar chips), satisfied rules collapse to a summary line, and the
 * dashboard unlocks live once the last rule is met.
 */
const GuidedFilterSetup: FC<Props> = ({
    onDismiss,
    startOfWeek,
    onSubPopoverOpen,
    onSubPopoverClose,
}) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const requiredFiltersNote = useDashboardContext(
        (c) => c.requiredFiltersNote,
    );
    const activeTab = useDashboardContext((c) => c.activeTab);
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const updateMetricDashboardFilter = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );

    // Rules a viewer re-opened via "Change"; satisfied rules collapse to a
    // summary line unless they're in here
    const [expandedRuleIds, setExpandedRuleIds] = useState<string[]>([]);

    const fieldsMap = useFilterableItemsMap();

    const rules = useMemo(
        () => getFilterRequirementRules(dashboardFilters),
        [dashboardFilters],
    );

    const satisfiedCount = rules.filter(isRequirementRuleSatisfied).length;

    // Keep the first unmet rule in view as the viewer works down the list
    const viewportRef = useRef<HTMLDivElement>(null);
    const firstUnmetRule = rules.find(
        (rule) => !isRequirementRuleSatisfied(rule),
    );
    const firstUnmetRuleId = firstUnmetRule?.id;
    useEffect(() => {
        if (!firstUnmetRuleId || !viewportRef.current) return;
        const target = viewportRef.current.querySelector(
            `[data-rule-id="${CSS.escape(firstUnmetRuleId)}"]`,
        );
        target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [firstUnmetRuleId]);

    const handleChangeFilterRule = useCallback(
        (newRule: DashboardFilterRule) => {
            // Mirrors the chip popover's view-mode behavior: a value enables the
            // filter, clearing it goes back to "any value" (and re-locks)
            const updatedRule = {
                ...newRule,
                disabled: !hasFilterValueSet(newRule),
            };
            const dimensionIndex = dashboardFilters.dimensions.findIndex(
                (filter) => filter.id === newRule.id,
            );
            if (dimensionIndex >= 0) {
                updateDimensionDashboardFilter(
                    updatedRule,
                    dimensionIndex,
                    false,
                    false,
                );
                return;
            }
            const metricIndex = dashboardFilters.metrics.findIndex(
                (filter) => filter.id === newRule.id,
            );
            if (metricIndex >= 0) {
                updateMetricDashboardFilter(
                    updatedRule,
                    metricIndex,
                    false,
                    false,
                );
            }
        },
        [
            dashboardFilters,
            updateDimensionDashboardFilter,
            updateMetricDashboardFilter,
        ],
    );

    if (!allFilterableFieldsMap) return null;

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={startOfWeek}
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTab?.uuid}
        >
            <Box data-testid="guided-filter-setup">
                <Stack gap="xs" px="xl" py="md">
                    <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                    >
                        <Group gap="sm" wrap="nowrap" miw={0}>
                            <Paper p="6px" withBorder radius="md">
                                <MantineIcon
                                    icon={IconFilterExclamation}
                                    size="md"
                                    color="yellow.7"
                                />
                            </Paper>
                            <Text
                                c="ldDark.9"
                                fw={700}
                                fz="md"
                                lh="28px"
                                miw={0}
                                lineClamp={2}
                            >
                                Set filters to load{' '}
                                {dashboard?.name ?? 'this dashboard'}
                            </Text>
                        </Group>
                        <CloseButton
                            aria-label="Close setup"
                            onClick={onDismiss}
                        />
                    </Group>
                    <Text size="xs" c="ldGray.6">
                        {requiredFiltersNote ||
                            'Data loads automatically once the filters below are set.'}
                    </Text>
                </Stack>
                <Divider />
                <ScrollArea.Autosize
                    mah="min(400px, 45vh)"
                    viewportRef={viewportRef}
                >
                    <Stack gap="sm" px="xl" py="md">
                        {rules.map((rule, ruleIndex) => {
                            const isSatisfied =
                                isRequirementRuleSatisfied(rule);
                            const isCollapsed =
                                isSatisfied &&
                                !expandedRuleIds.includes(rule.id);
                            const isMultiMember = rule.members.length > 1;

                            return (
                                <Fragment key={rule.id}>
                                    {ruleIndex > 0 && <AndSeparator />}
                                    <Box data-rule-id={rule.id}>
                                        <Collapse in={isCollapsed}>
                                            <RuleSummary
                                                rule={rule}
                                                fieldsMap={fieldsMap}
                                                onChange={() =>
                                                    setExpandedRuleIds(
                                                        (previous) => [
                                                            ...previous,
                                                            rule.id,
                                                        ],
                                                    )
                                                }
                                            />
                                        </Collapse>
                                        <Collapse in={!isCollapsed}>
                                            <Stack gap={6}>
                                                <Group gap={6} wrap="nowrap">
                                                    <RuleStatusIcon
                                                        satisfied={isSatisfied}
                                                    />
                                                    <Text
                                                        size="xs"
                                                        fw={500}
                                                        truncate
                                                    >
                                                        {isMultiMember
                                                            ? 'At least one of'
                                                            : getDashboardFilterRuleLabel(
                                                                  rule
                                                                      .members[0],
                                                                  fieldsMap,
                                                              )}
                                                    </Text>
                                                </Group>
                                                <Stack
                                                    gap={6}
                                                    pl={isMultiMember ? 22 : 0}
                                                >
                                                    {rule.members.map(
                                                        (
                                                            member,
                                                            memberIndex,
                                                        ) => (
                                                            <Fragment
                                                                key={member.id}
                                                            >
                                                                {memberIndex >
                                                                    0 && (
                                                                    <OrSeparator />
                                                                )}
                                                                <MemberInput
                                                                    member={
                                                                        member
                                                                    }
                                                                    field={
                                                                        fieldsMap[
                                                                            member
                                                                                .target
                                                                                .fieldId
                                                                        ]
                                                                    }
                                                                    label={getDashboardFilterRuleLabel(
                                                                        member,
                                                                        fieldsMap,
                                                                    )}
                                                                    showLabel={
                                                                        isMultiMember
                                                                    }
                                                                    popoverProps={{
                                                                        withinPortal: true,
                                                                        onOpen: onSubPopoverOpen,
                                                                        onClose:
                                                                            onSubPopoverClose,
                                                                    }}
                                                                    onChange={
                                                                        handleChangeFilterRule
                                                                    }
                                                                />
                                                            </Fragment>
                                                        ),
                                                    )}
                                                </Stack>
                                            </Stack>
                                        </Collapse>
                                    </Box>
                                </Fragment>
                            );
                        })}
                    </Stack>
                </ScrollArea.Autosize>
                <Divider />
                <Stack gap={6} px="xl" py="md">
                    <Group justify="space-between">
                        <Text size="xs" c="ldGray.6">
                            {satisfiedCount} of {rules.length} set
                        </Text>
                        <Text
                            size="xs"
                            c={
                                rules.length - satisfiedCount === 0
                                    ? 'green'
                                    : 'ldGray.5'
                            }
                        >
                            {rules.length - satisfiedCount === 0
                                ? 'Loading your dashboard'
                                : `${rules.length - satisfiedCount} more to go`}
                        </Text>
                    </Group>
                    <Progress
                        size="xs"
                        color={
                            satisfiedCount === rules.length ? 'green' : 'yellow'
                        }
                        value={
                            rules.length > 0
                                ? (satisfiedCount / rules.length) * 100
                                : 0
                        }
                    />
                    <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        c="ldGray.6"
                        ta="center"
                        mt={4}
                        onClick={onDismiss}
                    >
                        Set filters in the toolbar instead
                    </Anchor>
                </Stack>
            </Box>
        </FiltersProvider>
    );
};

export default GuidedFilterSetup;
