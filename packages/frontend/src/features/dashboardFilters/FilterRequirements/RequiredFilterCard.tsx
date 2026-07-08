import {
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Stack,
    Switch,
    Text,
} from '@mantine-8/core';
import { IconLock, IconPlus } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import FilterSelect, { type SelectableFilter } from './FilterSelect';
import classes from './RequiredFilterCard.module.css';
import { useUpdateDashboardFilterRule } from './useUpdateDashboardFilterRule';
import {
    getDashboardFilterRuleLabel,
    getRequirementIneligibilityReason,
} from './utils';

type Props = {
    filterRule: DashboardFilterRule;
    onToggleRequired: (checked: boolean) => void;
    onChangeFilterRule: (filterRule: DashboardFilterRule) => void;
    onEditRules?: () => void;
};

const RequiredFilterCard: FC<Props> = ({
    filterRule,
    onToggleRequired,
    onChangeFilterRule,
    onEditRules,
}) => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const updateFilterRule = useUpdateDashboardFilterRule();
    const [isAddingAlternative, setIsAddingAlternative] = useState(false);

    const isActive = !!filterRule.required || !!filterRule.requiredGroupId;

    const fieldsMap = useMemo<Record<string, FilterableItem>>(
        () => ({ ...allFilterableFieldsMap, ...allFilterableMetricsMap }),
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );

    const allFilterRules = useMemo(
        () => [...dashboardFilters.dimensions, ...dashboardFilters.metrics],
        [dashboardFilters],
    );

    // Siblings come from the saved dashboard filters; this filter's own flags
    // come from the draft being edited in this popover
    const siblings = useMemo(
        () =>
            filterRule.requiredGroupId
                ? allFilterRules.filter(
                      (rule) =>
                          rule.id !== filterRule.id &&
                          rule.requiredGroupId === filterRule.requiredGroupId,
                  )
                : [],
        [allFilterRules, filterRule.id, filterRule.requiredGroupId],
    );

    const sharesRule = isActive && siblings.length > 0;
    const isOnlyMember = isActive && siblings.length === 0;

    // Adding an alternative writes to the sibling filter immediately, so it
    // is only offered once this filter itself is saved on the dashboard
    const isSavedFilter = useMemo(
        () => allFilterRules.some((rule) => rule.id === filterRule.id),
        [allFilterRules, filterRule.id],
    );

    const selectableFilters = useMemo<SelectableFilter[]>(
        () =>
            allFilterRules
                .filter((rule) => rule.id !== filterRule.id)
                .map((rule) => {
                    const reason = getRequirementIneligibilityReason(rule);
                    return {
                        value: rule.id,
                        label: getDashboardFilterRuleLabel(rule, fieldsMap),
                        disabled: reason !== null,
                        reason,
                    };
                }),
        [allFilterRules, filterRule.id, fieldsMap],
    );

    const handleAddAlternative = (siblingId: string) => {
        const groupId = filterRule.requiredGroupId ?? uuidv4();
        // Rule members are valueless by definition
        updateFilterRule(siblingId, {
            requiredGroupId: groupId,
            required: false,
            disabled: true,
            values: [],
        });
        updateFilterRule(filterRule.id, {
            required: false,
            requiredGroupId: groupId,
        });
        onChangeFilterRule({
            ...filterRule,
            required: false,
            requiredGroupId: groupId,
            disabled: true,
            values: [],
        });
        setIsAddingAlternative(false);
    };

    return (
        <Box
            className={`${classes.card} ${isActive ? classes.cardActive : ''}`}
        >
            <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <MantineIcon
                        icon={IconLock}
                        size="sm"
                        color={isActive ? 'yellow.7' : 'ldGray.6'}
                    />
                    <Text size="xs" fw={600}>
                        Required
                    </Text>
                </Group>
                <Switch
                    size="xs"
                    color="yellow.6"
                    aria-label="Required"
                    checked={isActive}
                    onChange={(e) => onToggleRequired(e.currentTarget.checked)}
                />
            </Group>
            {isOnlyMember && (
                <Stack gap={6} mt="xs">
                    <Text size="xs" c="ldGray.7">
                        Viewers must set this filter to load the dashboard.
                    </Text>
                    {isSavedFilter &&
                        (isAddingAlternative ? (
                            <FilterSelect
                                selectableFilters={selectableFilters}
                                placeholder="+ Add a filter"
                                onSelect={handleAddAlternative}
                            />
                        ) : (
                            <Button
                                size="compact-xs"
                                variant="light"
                                color="blue"
                                radius="xl"
                                w="max-content"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={() => setIsAddingAlternative(true)}
                            >
                                Add an alternative filter
                            </Button>
                        ))}
                </Stack>
            )}
            {sharesRule && (
                <Stack gap={6} className={classes.groupSection}>
                    <Text size="xs" c="ldGray.6">
                        Shares a rule. Viewers can satisfy it by setting this or
                        an alternative:
                    </Text>
                    <Group gap={4}>
                        {siblings.map((member) => (
                            <Badge
                                key={member.id}
                                variant="outline"
                                color="yellow"
                                radius="xl"
                                tt="none"
                                fw={500}
                            >
                                {getDashboardFilterRuleLabel(member, fieldsMap)}
                            </Badge>
                        ))}
                        {onEditRules && (
                            <Anchor
                                component="button"
                                type="button"
                                size="xs"
                                onClick={onEditRules}
                            >
                                Edit rule →
                            </Anchor>
                        )}
                    </Group>
                </Stack>
            )}
        </Box>
    );
};

export default RequiredFilterCard;
