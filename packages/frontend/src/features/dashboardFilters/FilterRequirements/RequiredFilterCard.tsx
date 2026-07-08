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
    getRuleLetter,
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

    const { ruleLetter, otherMemberLabels } = useMemo(() => {
        if (!isRuleMember) {
            return { ruleLetter: 'A', otherMemberLabels: [] };
        }
        const fieldsMap: Record<string, FilterableItem> = {
            ...allFilterableFieldsMap,
            ...allFilterableMetricsMap,
        };
        const rules = getFilterRequirementRules(dashboardFilters);
        const ruleIndex = rules.findIndex(
            (rule) => rule.groupId === filterRule.requiredGroupId,
        );
        const members = ruleIndex >= 0 ? rules[ruleIndex].members : [];
        return {
            ruleLetter: getRuleLetter(Math.max(ruleIndex, 0)),
            otherMemberLabels: members
                .filter((member) => member.id !== filterRule.id)
                .map((member) =>
                    getDashboardFilterRuleLabel(member, fieldsMap),
                ),
        };
    }, [
        isRuleMember,
        dashboardFilters,
        allFilterableFieldsMap,
        allFilterableMetricsMap,
        filterRule.requiredGroupId,
        filterRule.id,
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
                    <Group gap={6} wrap="nowrap">
                        <Badge variant="light" color="yellow" radius="sm">
                            {ruleLetter}
                        </Badge>
                        <Text size="xs">
                            At least one of group {ruleLetter} must be set
                        </Text>
                    </Group>
                    <Group gap={6}>
                        <Text size="xs" c="ldGray.6">
                            With:
                        </Text>
                        {otherMemberLabels.map((label) => (
                            <Badge
                                key={label}
                                variant="outline"
                                color="yellow.7"
                                radius="sm"
                                tt="none"
                                fw={500}
                            >
                                {label}
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
