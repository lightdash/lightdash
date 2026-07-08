import {
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Pill,
    Popover,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import classes from './FilterRequirements.module.css';
import {
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

type RequirementRuleRowProps = {
    members: DashboardFilterRule[];
    selectableFilters: SelectableFilter[];
    getFilterLabel: (filterRule: DashboardFilterRule) => string;
    onAddMember: (filterId: string) => void;
    onRemoveMember: (filterId: string) => void;
    onDeleteRule: () => void;
};

const RequirementRuleRow: FC<RequirementRuleRowProps> = ({
    members,
    selectableFilters,
    getFilterLabel,
    onAddMember,
    onRemoveMember,
    onDeleteRule,
}) => (
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
                <Pill
                    key={member.id}
                    withRemoveButton
                    onRemove={() => onRemoveMember(member.id)}
                >
                    {getFilterLabel(member)}
                </Pill>
            ))}
            <Select
                size="xs"
                w={180}
                placeholder="Add filter"
                value={null}
                data={selectableFilters}
                comboboxProps={{ withinPortal: false }}
                onChange={(filterId) => {
                    if (filterId) onAddMember(filterId);
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
        </Group>
    </Stack>
);

const FilterRequirementsButton: FC = () => {
    const [isPopoverOpen, { open, close }] = useDisclosure(false);
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

    const fieldsMap = useMemo<Record<string, FilterableItem>>(
        () => ({ ...allFilterableFieldsMap, ...allFilterableMetricsMap }),
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );

    const getFilterLabel = useCallback(
        (filterRule: DashboardFilterRule) =>
            getDashboardFilterRuleLabel(filterRule, fieldsMap),
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

    const handleClose = useCallback(() => {
        close();
        setDraftRuleIds([]);
    }, [close]);

    const isEmpty = requirementRules.length === 0 && draftRuleIds.length === 0;

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
                    className={classes.requirementsButton}
                    rightSection={
                        requirementRules.length > 0 ? (
                            <Badge size="xs" variant="light" circle>
                                {requirementRules.length}
                            </Badge>
                        ) : undefined
                    }
                    onClick={() => (isPopoverOpen ? handleClose() : open())}
                >
                    Requirements
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Stack w={400} gap="sm">
                    <Text size="sm" fw={600}>
                        Filter requirements
                    </Text>
                    {isEmpty ? (
                        <>
                            <Text size="xs" c="ldGray.6">
                                Require viewers to set at least one of a set of
                                filters before the dashboard loads.
                            </Text>
                            <Button
                                size="xs"
                                variant="default"
                                w="max-content"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={handleAddRule}
                            >
                                Add rule
                            </Button>
                        </>
                    ) : (
                        <>
                            {requirementRules.map((rule) => (
                                <RequirementRuleRow
                                    key={rule.groupId}
                                    members={rule.members}
                                    selectableFilters={getSelectableFilters(
                                        rule.groupId,
                                    )}
                                    getFilterLabel={getFilterLabel}
                                    onAddMember={(filterId) =>
                                        handleAddMember(rule.groupId, filterId)
                                    }
                                    onRemoveMember={handleRemoveMember}
                                    onDeleteRule={() => handleDeleteRule(rule)}
                                />
                            ))}
                            {draftRuleIds.map((draftId) => (
                                <RequirementRuleRow
                                    key={draftId}
                                    members={[]}
                                    selectableFilters={getSelectableFilters(
                                        draftId,
                                    )}
                                    getFilterLabel={getFilterLabel}
                                    onAddMember={(filterId) =>
                                        handleAddMember(draftId, filterId)
                                    }
                                    onRemoveMember={handleRemoveMember}
                                    onDeleteRule={() =>
                                        setDraftRuleIds((previous) =>
                                            previous.filter(
                                                (id) => id !== draftId,
                                            ),
                                        )
                                    }
                                />
                            ))}
                            <Button
                                size="xs"
                                variant="subtle"
                                w="max-content"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={handleAddRule}
                            >
                                Add another rule
                            </Button>
                            <Group gap={6} wrap="nowrap">
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="ldGray.6"
                                />
                                <Text size="xs" c="ldGray.6">
                                    Tiles stay locked until every rule is
                                    satisfied.
                                </Text>
                            </Group>
                        </>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterRequirementsButton;
