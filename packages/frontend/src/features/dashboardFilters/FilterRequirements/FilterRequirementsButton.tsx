import {
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Button,
    CloseButton,
    Divider,
    Group,
    Popover,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { Fragment, useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Callout from '../../../components/common/Callout';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import classes from './FilterRequirements.module.css';
import { useFilterRulesPopover } from './useFilterRulesPopover';
import {
    getAlwaysRequiredFilters,
    getAlwaysRequiredIneligibilityReason,
    getDashboardFilterRuleLabel,
    getFilterRequirementRules,
    getRequirementIneligibilityReason,
    type FilterRequirementRule,
} from './utils';

type SelectableFilter = {
    value: string;
    label: string;
    disabled: boolean;
    reason: string | null;
};

type FilterSelectProps = {
    selectableFilters: SelectableFilter[];
    onSelect: (filterId: string) => void;
};

const FilterSelect: FC<FilterSelectProps> = ({
    selectableFilters,
    onSelect,
}) => (
    <Select
        size="xs"
        w={130}
        placeholder="+ Add filter"
        value={null}
        data={selectableFilters}
        comboboxProps={{ withinPortal: false }}
        classNames={{ input: classes.addFilterInput }}
        onChange={(filterId) => {
            if (filterId) onSelect(filterId);
        }}
        renderOption={({ option }) => {
            const reason = selectableFilters.find(
                (filter) => filter.value === option.value,
            )?.reason;
            return (
                <Stack gap={0}>
                    <Text size="xs">{option.label}</Text>
                    {reason && (
                        <Text size="xs" c="dimmed">
                            {reason}
                        </Text>
                    )}
                </Stack>
            );
        }}
    />
);

type MemberChipProps = {
    item: FilterableItem | undefined;
    label: string;
    onRemove: (() => void) | undefined;
};

const MemberChip: FC<MemberChipProps> = ({ item, label, onRemove }) => (
    <Group gap={4} wrap="nowrap" className={classes.memberChip}>
        {item && <FieldIcon item={item} size="sm" />}
        <Text size="xs" truncate>
            {label}
        </Text>
        {onRemove && (
            <CloseButton
                size="xs"
                aria-label={`Remove ${label}`}
                onClick={onRemove}
            />
        )}
    </Group>
);

const AndSeparator: FC = () => (
    <Divider
        label={
            <Text size="10px" fw={600} c="ldGray.6">
                AND
            </Text>
        }
        labelPosition="center"
    />
);

type AlwaysRequiredSectionProps = {
    requiredFilters: DashboardFilterRule[];
    selectableFilters: SelectableFilter[];
    getFilterLabel: (filterRule: DashboardFilterRule) => string;
    getFilterItem: (
        filterRule: DashboardFilterRule,
    ) => FilterableItem | undefined;
    onAddFilter: (filterId: string) => void;
    onRemoveFilter: (filterId: string) => void;
};

const AlwaysRequiredSection: FC<AlwaysRequiredSectionProps> = ({
    requiredFilters,
    selectableFilters,
    getFilterLabel,
    getFilterItem,
    onAddFilter,
    onRemoveFilter,
}) => (
    <Stack gap="xs" className={classes.ruleRow}>
        <Text size="xs" fw={500}>
            Always required — viewers must set each of:
        </Text>
        <Group gap="xs">
            {requiredFilters.map((filterRule) => (
                <MemberChip
                    key={filterRule.id}
                    item={getFilterItem(filterRule)}
                    label={getFilterLabel(filterRule)}
                    onRemove={() => onRemoveFilter(filterRule.id)}
                />
            ))}
            <FilterSelect
                selectableFilters={selectableFilters}
                onSelect={onAddFilter}
            />
        </Group>
    </Stack>
);

type RequirementRuleRowProps = {
    members: DashboardFilterRule[];
    selectableFilters: SelectableFilter[];
    getFilterLabel: (filterRule: DashboardFilterRule) => string;
    getFilterItem: (
        filterRule: DashboardFilterRule,
    ) => FilterableItem | undefined;
    onAddMember: (filterId: string) => void;
    onRemoveMember: (filterId: string) => void;
    onDeleteRule: () => void;
};

const RequirementRuleRow: FC<RequirementRuleRowProps> = ({
    members,
    selectableFilters,
    getFilterLabel,
    getFilterItem,
    onAddMember,
    onRemoveMember,
    onDeleteRule,
}) => {
    const isLastMember = members.length === 1;

    return (
        <Stack gap="xs" className={classes.ruleRow}>
            <Group gap="xs" justify="space-between" wrap="nowrap">
                <Text size="xs" fw={500}>
                    Viewers must set at least one of:
                </Text>
                <Tooltip label="Remove rule" withinPortal>
                    <ActionIcon
                        aria-label="Remove rule"
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={onDeleteRule}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Group gap="xs">
                {members.map((member) => (
                    <MemberChip
                        key={member.id}
                        item={getFilterItem(member)}
                        label={getFilterLabel(member)}
                        onRemove={
                            isLastMember
                                ? undefined
                                : () => onRemoveMember(member.id)
                        }
                    />
                ))}
                <FilterSelect
                    selectableFilters={selectableFilters}
                    onSelect={onAddMember}
                />
            </Group>
            {isLastMember && (
                <Callout
                    variant="info"
                    p="xs"
                    icon={<MantineIcon icon={IconInfoCircle} />}
                >
                    <Text size="xs">
                        A rule needs at least 2 filters. Add another filter or{' '}
                        <Anchor
                            component="button"
                            type="button"
                            size="xs"
                            onClick={onDeleteRule}
                        >
                            delete this rule
                        </Anchor>
                        .
                    </Text>
                </Callout>
            )}
        </Stack>
    );
};

const FilterRequirementsButton: FC = () => {
    const [isLocalPopoverOpen, { open: openLocal, close: closeLocal }] =
        useDisclosure(false);
    const sharedPopoverState = useFilterRulesPopover();
    const isPopoverOpen = sharedPopoverState?.isOpen ?? isLocalPopoverOpen;
    const open = sharedPopoverState?.open ?? openLocal;
    const close = sharedPopoverState?.close ?? closeLocal;
    const [draftRuleIds, setDraftRuleIds] = useState<string[]>([]);

    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const updateMetricDashboardFilter = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );

    const requirementRules = useMemo(
        () => getFilterRequirementRules(dashboardFilters),
        [dashboardFilters],
    );

    const alwaysRequiredFilters = useMemo(
        () => getAlwaysRequiredFilters(dashboardFilters),
        [dashboardFilters],
    );

    const fieldsMap = useMemo<Record<string, FilterableItem>>(
        () => ({ ...allFilterableFieldsMap, ...allFilterableMetricsMap }),
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );

    const getFilterLabel = useCallback(
        (filterRule: DashboardFilterRule) =>
            getDashboardFilterRuleLabel(filterRule, fieldsMap),
        [fieldsMap],
    );

    const getFilterItem = useCallback(
        (filterRule: DashboardFilterRule) =>
            fieldsMap[filterRule.target.fieldId],
        [fieldsMap],
    );

    const allFilterRules = useMemo(
        () => [...dashboardFilters.dimensions, ...dashboardFilters.metrics],
        [dashboardFilters],
    );

    const getSelectableFilters = useCallback(
        (currentGroupId: string): SelectableFilter[] =>
            allFilterRules
                .filter(
                    (filterRule) =>
                        filterRule.requiredGroupId !== currentGroupId,
                )
                .map((filterRule) => {
                    const reason =
                        getRequirementIneligibilityReason(filterRule);
                    return {
                        value: filterRule.id,
                        label: getFilterLabel(filterRule),
                        disabled: reason !== null,
                        reason,
                    };
                }),
        [allFilterRules, getFilterLabel],
    );

    const alwaysRequiredSelectableFilters = useMemo<SelectableFilter[]>(
        () =>
            allFilterRules
                .filter((filterRule) => !filterRule.required)
                .map((filterRule) => {
                    const reason =
                        getAlwaysRequiredIneligibilityReason(filterRule);
                    return {
                        value: filterRule.id,
                        label: getFilterLabel(filterRule),
                        disabled: reason !== null,
                        reason,
                    };
                }),
        [allFilterRules, getFilterLabel],
    );

    const updateFilterRule = useCallback(
        (filterId: string, updates: Partial<DashboardFilterRule>) => {
            const dimensionIndex = dashboardFilters.dimensions.findIndex(
                (filterRule) => filterRule.id === filterId,
            );
            if (dimensionIndex >= 0) {
                updateDimensionDashboardFilter(
                    {
                        ...dashboardFilters.dimensions[dimensionIndex],
                        ...updates,
                    },
                    dimensionIndex,
                    false,
                    true,
                );
                return;
            }
            const metricIndex = dashboardFilters.metrics.findIndex(
                (filterRule) => filterRule.id === filterId,
            );
            if (metricIndex >= 0) {
                updateMetricDashboardFilter(
                    { ...dashboardFilters.metrics[metricIndex], ...updates },
                    metricIndex,
                    false,
                    true,
                );
            }
        },
        [
            dashboardFilters,
            updateDimensionDashboardFilter,
            updateMetricDashboardFilter,
        ],
    );

    const handleAddRule = useCallback(() => {
        setDraftRuleIds((previous) => [...previous, uuidv4()]);
    }, []);

    const handleAddMember = useCallback(
        (groupId: string, filterId: string) => {
            // Rule members are valueless by definition
            updateFilterRule(filterId, {
                requiredGroupId: groupId,
                required: false,
                disabled: true,
                values: [],
            });
            setDraftRuleIds((previous) =>
                previous.filter((id) => id !== groupId),
            );
        },
        [updateFilterRule],
    );

    const handleRemoveMember = useCallback(
        (filterId: string) => {
            updateFilterRule(filterId, { requiredGroupId: undefined });
        },
        [updateFilterRule],
    );

    const handleDeleteRule = useCallback(
        (rule: FilterRequirementRule) => {
            rule.members.forEach((member) =>
                updateFilterRule(member.id, { requiredGroupId: undefined }),
            );
        },
        [updateFilterRule],
    );

    const handleAddAlwaysRequired = useCallback(
        (filterId: string) => {
            // Required filters are valueless by definition
            updateFilterRule(filterId, {
                required: true,
                disabled: true,
                values: [],
            });
        },
        [updateFilterRule],
    );

    const handleRemoveAlwaysRequired = useCallback(
        (filterId: string) => {
            updateFilterRule(filterId, { required: false });
        },
        [updateFilterRule],
    );

    const handleClose = useCallback(() => {
        close();
        setDraftRuleIds([]);
    }, [close]);

    const requirementCount =
        alwaysRequiredFilters.length + requirementRules.length;
    const hasRuleRows = requirementRules.length > 0 || draftRuleIds.length > 0;
    const hasAlwaysRequired = alwaysRequiredFilters.length > 0;
    const isEmpty = requirementCount === 0 && draftRuleIds.length === 0;

    return (
        <Popover
            position="bottom-start"
            opened={isPopoverOpen}
            onClose={handleClose}
            onDismiss={handleClose}
            transitionProps={{ transition: 'pop-top-left' }}
            withArrow
            shadow="md"
            offset={1}
            arrowOffset={14}
            withinPortal
        >
            <Popover.Target>
                <Button
                    size="xs"
                    variant="default"
                    radius={100}
                    className={
                        requirementCount > 0
                            ? `${classes.requirementsButton} ${classes.requirementsButtonActive}`
                            : classes.requirementsButton
                    }
                    rightSection={
                        requirementCount > 0 ? (
                            <Badge size="xs" color="yellow" autoContrast circle>
                                {requirementCount}
                            </Badge>
                        ) : undefined
                    }
                    onClick={() => (isPopoverOpen ? handleClose() : open())}
                >
                    Filter rules
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Stack w={400} gap="sm">
                    <Stack gap={2}>
                        <Text size="sm" fw={600}>
                            Filter rules
                        </Text>
                        <Text size="xs" c="ldGray.6">
                            Dashboard won't load until all rules are met.
                        </Text>
                    </Stack>
                    {isEmpty && (
                        <Text size="xs" c="ldGray.6">
                            Require viewers to set filters before the dashboard
                            loads, either individually or at least one from a
                            set.
                        </Text>
                    )}
                    <AlwaysRequiredSection
                        requiredFilters={alwaysRequiredFilters}
                        selectableFilters={alwaysRequiredSelectableFilters}
                        getFilterLabel={getFilterLabel}
                        getFilterItem={getFilterItem}
                        onAddFilter={handleAddAlwaysRequired}
                        onRemoveFilter={handleRemoveAlwaysRequired}
                    />
                    {requirementRules.map((rule, index) => (
                        <Fragment key={rule.groupId}>
                            {(hasAlwaysRequired || index > 0) && (
                                <AndSeparator />
                            )}
                            <RequirementRuleRow
                                members={rule.members}
                                selectableFilters={getSelectableFilters(
                                    rule.groupId,
                                )}
                                getFilterLabel={getFilterLabel}
                                getFilterItem={getFilterItem}
                                onAddMember={(filterId) =>
                                    handleAddMember(rule.groupId, filterId)
                                }
                                onRemoveMember={handleRemoveMember}
                                onDeleteRule={() => handleDeleteRule(rule)}
                            />
                        </Fragment>
                    ))}
                    {draftRuleIds.map((draftId, index) => (
                        <Fragment key={draftId}>
                            {(hasAlwaysRequired ||
                                requirementRules.length > 0 ||
                                index > 0) && <AndSeparator />}
                            <RequirementRuleRow
                                members={[]}
                                selectableFilters={getSelectableFilters(
                                    draftId,
                                )}
                                getFilterLabel={getFilterLabel}
                                getFilterItem={getFilterItem}
                                onAddMember={(filterId) =>
                                    handleAddMember(draftId, filterId)
                                }
                                onRemoveMember={handleRemoveMember}
                                onDeleteRule={() =>
                                    setDraftRuleIds((previous) =>
                                        previous.filter((id) => id !== draftId),
                                    )
                                }
                            />
                        </Fragment>
                    ))}
                    <Button
                        size="xs"
                        variant="subtle"
                        color="blue"
                        fullWidth
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={handleAddRule}
                    >
                        {hasRuleRows ? 'Add another rule' : 'Add rule'}
                    </Button>
                    {!isEmpty && (
                        <Group gap={6} wrap="nowrap">
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="ldGray.6"
                            />
                            <Text size="xs" c="ldGray.6">
                                All tiles stay locked until every rule is
                                satisfied.
                            </Text>
                        </Group>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterRequirementsButton;
