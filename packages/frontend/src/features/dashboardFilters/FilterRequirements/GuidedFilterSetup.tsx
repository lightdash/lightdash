import {
    DimensionType,
    getFilterTypeFromItem,
    getFilterTypeFromItemType,
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
    type FilterableItem,
    type FilterType,
    type WeekDay,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Collapse,
    Group,
    Progress,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import { IconCheck, IconCircleDashed } from '@tabler/icons-react';
import {
    Fragment,
    useCallback,
    useEffect,
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
import OperatorPicker from './OperatorPicker';
import { AndSeparator, OrSeparator } from './RuleSeparators';
import { useFilterableItemsMap } from './useFilterableItemsMap';
import { useUpdateDashboardFilterRule } from './useUpdateDashboardFilterRule';
import {
    getDashboardFilterRuleLabel,
    isRequirementRuleSatisfied,
    type FilterRequirementRule,
} from './utils';

const getMemberFilterType = (
    member: DashboardFilterRule,
    field: FilterableItem | undefined,
): FilterType =>
    field
        ? getFilterTypeFromItem(field)
        : getFilterTypeFromItemType(
              member.target.fallbackType ?? DimensionType.STRING,
          );

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
}) => {
    const filterType = getMemberFilterType(member, field);

    return (
        // Label sits on its own line above a full-width input so long field
        // names aren't squeezed by the input column
        <Stack gap={4}>
            {showLabel && (
                <Group gap={6} wrap="nowrap" align="baseline">
                    <TruncatedText maxWidth="100%" fz="xs" fw={500}>
                        {label}
                    </TruncatedText>
                    <OperatorPicker
                        filterType={filterType}
                        field={field}
                        member={member}
                        label={label}
                        onChange={onChange}
                        onOpen={popoverProps.onOpen}
                        onClose={popoverProps.onClose}
                    />
                </Group>
            )}
            {/* Keyed so a changed operator fades its new input shape in */}
            <Box key={member.operator} className={classes.valueSwap}>
                <FilterInputComponent
                    filterType={filterType}
                    field={field}
                    rule={member}
                    popoverProps={popoverProps}
                    onChange={(newRule) =>
                        onChange(newRule as DashboardFilterRule)
                    }
                />
            </Box>
        </Stack>
    );
};

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
    const ruleLabels = field
        ? getConditionalRuleLabelFromItem(setMember, field)
        : undefined;
    const valueLabel = ruleLabels
        ? [ruleLabels.operator, ruleLabels.value].filter(Boolean).join(' ')
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
    rules: FilterRequirementRule[];
    startOfWeek?: WeekDay;
    /** Report nested filter dropdown state, like the chip popovers do */
    onSubPopoverOpen?: () => void;
    onSubPopoverClose?: () => void;
};

/**
 * Viewer-facing rule list shown over the locked grid while filter
 * requirements are unmet: every rule gets a real value picker (same state as
 * the filter bar chips), satisfied rules collapse to a summary line, and the
 * dashboard unlocks live once the last rule is met. Rendered as the body of
 * the guided setup modal (see GuidedFilterSetupOverlay).
 */
const GuidedFilterSetup: FC<Props> = ({
    rules,
    startOfWeek,
    onSubPopoverOpen,
    onSubPopoverClose,
}) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const activeTab = useDashboardContext((c) => c.activeTab);
    const updateFilterRule = useUpdateDashboardFilterRule({
        isEditMode: false,
    });

    // Rules a viewer re-opened via "Change"; satisfied rules collapse to a
    // summary line unless they're in here
    const [expandedRuleIds, setExpandedRuleIds] = useState<string[]>([]);

    const fieldsMap = useFilterableItemsMap();

    // Keep the first unmet rule in view as the viewer works down the list;
    // scrollIntoView targets the modal body's scroll area
    const rootRef = useRef<HTMLDivElement>(null);
    const firstUnmetRule = rules.find(
        (rule) => !isRequirementRuleSatisfied(rule),
    );
    const firstUnmetRuleId = firstUnmetRule?.id;
    useEffect(() => {
        if (!firstUnmetRuleId || !rootRef.current) return;
        const target = rootRef.current.querySelector(
            `[data-rule-id="${CSS.escape(firstUnmetRuleId)}"]`,
        );
        target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [firstUnmetRuleId]);

    const handleChangeFilterRule = useCallback(
        (newRule: DashboardFilterRule) => {
            // Mirrors the chip popover's view-mode behavior: a value enables the
            // filter, clearing it goes back to "any value" (and re-locks)
            updateFilterRule(newRule.id, {
                ...newRule,
                disabled: !hasFilterValueSet(newRule),
            });
        },
        [updateFilterRule],
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
            <Box data-testid="guided-filter-setup" ref={rootRef}>
                <Stack gap="sm">
                    {rules.map((rule, ruleIndex) => {
                        const isSatisfied = isRequirementRuleSatisfied(rule);
                        const isCollapsed =
                            isSatisfied && !expandedRuleIds.includes(rule.id);
                        const isMultiMember = rule.members.length > 1;
                        const firstMember = rule.members[0];
                        const firstMemberField =
                            fieldsMap[firstMember.target.fieldId];

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
                                                <Group
                                                    gap={6}
                                                    wrap="nowrap"
                                                    align="baseline"
                                                    miw={0}
                                                >
                                                    <Text
                                                        size="xs"
                                                        fw={500}
                                                        truncate
                                                    >
                                                        {isMultiMember
                                                            ? 'At least one of'
                                                            : getDashboardFilterRuleLabel(
                                                                  firstMember,
                                                                  fieldsMap,
                                                              )}
                                                    </Text>
                                                    {!isMultiMember && (
                                                        <OperatorPicker
                                                            filterType={getMemberFilterType(
                                                                firstMember,
                                                                firstMemberField,
                                                            )}
                                                            field={
                                                                firstMemberField
                                                            }
                                                            member={firstMember}
                                                            label={getDashboardFilterRuleLabel(
                                                                firstMember,
                                                                fieldsMap,
                                                            )}
                                                            onChange={
                                                                handleChangeFilterRule
                                                            }
                                                            onOpen={
                                                                onSubPopoverOpen
                                                            }
                                                            onClose={
                                                                onSubPopoverClose
                                                            }
                                                        />
                                                    )}
                                                </Group>
                                            </Group>
                                            <Stack
                                                gap={6}
                                                pl={isMultiMember ? 22 : 0}
                                            >
                                                {rule.members.map(
                                                    (member, memberIndex) => (
                                                        <Fragment
                                                            key={member.id}
                                                        >
                                                            {memberIndex >
                                                                0 && (
                                                                <OrSeparator />
                                                            )}
                                                            <MemberInput
                                                                member={member}
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
            </Box>
        </FiltersProvider>
    );
};

type GuidedFilterSetupProgressProps = {
    rules: FilterRequirementRule[];
    onDismiss: () => void;
};

/** Progress readout rendered as the guided setup modal's footer */
export const GuidedFilterSetupProgress: FC<GuidedFilterSetupProgressProps> = ({
    rules,
    onDismiss,
}) => {
    const satisfiedCount = rules.filter(isRequirementRuleSatisfied).length;
    const remainingCount = rules.length - satisfiedCount;

    return (
        <Stack gap={6}>
            <Group justify="space-between">
                <Text size="xs" c="ldGray.6">
                    {satisfiedCount} of {rules.length} set
                </Text>
                <Text size="xs" c={remainingCount === 0 ? 'green' : 'ldGray.5'}>
                    {remainingCount === 0
                        ? 'Loading your dashboard'
                        : `${remainingCount} more to go`}
                </Text>
            </Group>
            <Progress
                size="xs"
                color={remainingCount === 0 ? 'green' : 'yellow'}
                value={
                    rules.length > 0 ? (satisfiedCount / rules.length) * 100 : 0
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
    );
};

export default GuidedFilterSetup;
