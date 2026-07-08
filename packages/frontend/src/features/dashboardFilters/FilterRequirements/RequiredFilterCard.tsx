import {
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Group,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconLock } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import classes from './RequiredFilterCard.module.css';
import {
    getDashboardFilterRuleLabel,
    getFilterRequirementRules,
} from './utils';

type Props = {
    filterRule: DashboardFilterRule;
    onToggleRequired: (checked: boolean) => void;
    onEditRules?: () => void;
};

const RequiredFilterCard: FC<Props> = ({
    filterRule,
    onToggleRequired,
    onEditRules,
}) => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );

    // `required` wins when hand-authored JSON sets both flags
    const isRuleMember = !filterRule.required && !!filterRule.requiredGroupId;
    const isActive = !!filterRule.required || isRuleMember;

    // All members of this filter's rule, with the current filter last
    const ruleMemberBadges = useMemo(() => {
        if (!isRuleMember) return [];
        const fieldsMap: Record<string, FilterableItem> = {
            ...allFilterableFieldsMap,
            ...allFilterableMetricsMap,
        };
        const rule = getFilterRequirementRules(dashboardFilters).find(
            (requirementRule) =>
                requirementRule.groupId === filterRule.requiredGroupId,
        );
        const otherMembers = (rule?.members ?? []).filter(
            (member) => member.id !== filterRule.id,
        );
        return [...otherMembers, filterRule].map((member) => ({
            id: member.id,
            label: getDashboardFilterRuleLabel(member, fieldsMap),
        }));
    }, [
        isRuleMember,
        dashboardFilters,
        allFilterableFieldsMap,
        allFilterableMetricsMap,
        filterRule,
    ]);

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
                        Required filter
                    </Text>
                </Group>
                <Tooltip
                    withinPortal
                    position="left"
                    multiline
                    maw={250}
                    label="This filter is part of a filter rule — manage it from Filter rules in the filter bar"
                    disabled={!isRuleMember}
                >
                    <Box>
                        <Switch
                            size="xs"
                            color="yellow.6"
                            aria-label="Required filter"
                            checked={isActive}
                            disabled={isRuleMember}
                            onChange={(e) =>
                                onToggleRequired(e.currentTarget.checked)
                            }
                        />
                    </Box>
                </Tooltip>
            </Group>
            {filterRule.required && (
                <Text size="xs" c="ldGray.7" mt="xs">
                    Viewers must pick a value to load this dashboard.
                </Text>
            )}
            {isRuleMember && (
                <Stack gap={6} className={classes.groupSection}>
                    <Text className={classes.groupLabel}>
                        Requirement group
                    </Text>
                    <Text size="xs" c="ldGray.6">
                        Setting any one of these satisfies this rule:
                    </Text>
                    <Group gap={4}>
                        {ruleMemberBadges.map((member) => (
                            <Badge
                                key={member.id}
                                variant="outline"
                                color="yellow"
                                radius="xl"
                                tt="none"
                                fw={500}
                            >
                                {member.label}
                            </Badge>
                        ))}
                        {onEditRules && (
                            <Anchor
                                component="button"
                                type="button"
                                size="xs"
                                onClick={onEditRules}
                            >
                                Edit rules →
                            </Anchor>
                        )}
                    </Group>
                </Stack>
            )}
        </Box>
    );
};

export default RequiredFilterCard;
