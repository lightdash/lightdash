import {
    type DashboardFilterRule,
    type FilterableItem,
    type UnmetFilterRequirement,
} from '@lightdash/common';
import { Badge, Group, Text, UnstyledButton } from '@mantine-8/core';
import { IconAlertTriangle, IconLock } from '@tabler/icons-react';
import { Fragment, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import classes from './RequiredFiltersBanner.module.css';
import { useFilterBarPopovers } from './useFilterBarPopovers';
import { getDashboardFilterRuleLabel } from './utils';

type FilterNameTagProps = {
    filterRule: DashboardFilterRule;
    label: string;
    onClick: () => void;
};

const FilterNameTag: FC<FilterNameTagProps> = ({ label, onClick }) => (
    <UnstyledButton onClick={onClick}>
        <Badge
            variant="light"
            color="yellow"
            radius="xl"
            tt="none"
            fw={600}
            leftSection={<MantineIcon icon={IconLock} size={11} />}
            className={classes.filterNameTag}
        >
            {label}
        </Badge>
    </UnstyledButton>
);

type Props = {
    /** Called before opening a filter chip popover, e.g. to expand a collapsed filter bar */
    onBeforeOpenFilter?: () => void;
};

const getRequirementMembers = (
    requirement: UnmetFilterRequirement,
): DashboardFilterRule[] =>
    requirement.type === 'single' ? [requirement.filter] : requirement.filters;

const getRequirementKey = (requirement: UnmetFilterRequirement): string =>
    requirement.type === 'single' ? requirement.filter.id : requirement.groupId;

/**
 * Full-width amber banner shown below the filter bar while filter
 * requirements are unmet, listing every unmet rule in one sentence. Clicking
 * a filter name opens that filter's chip popover in the bar.
 */
const RequiredFiltersBanner: FC<Props> = ({ onBeforeOpenFilter }) => {
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const unmetFilterRequirements = useDashboardContext(
        (c) => c.unmetFilterRequirements,
    );
    const popovers = useFilterBarPopovers();

    const fieldsMap = useMemo<Record<string, FilterableItem>>(
        () => ({ ...allFilterableFieldsMap, ...allFilterableMetricsMap }),
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );

    if (unmetFilterRequirements.length === 0) return null;

    const handleOpenFilter = (filterId: string) => {
        onBeforeOpenFilter?.();
        popovers?.openFilterPopover(filterId);
    };

    const isSingleFilter =
        unmetFilterRequirements.length === 1 &&
        getRequirementMembers(unmetFilterRequirements[0]).length === 1;

    return (
        <Group gap={6} align="center" wrap="wrap" className={classes.banner}>
            <MantineIcon icon={IconAlertTriangle} color="yellow.6" />
            <Text size="xs" c="ldGray.6">
                {isSingleFilter
                    ? 'To load data, set this filter:'
                    : 'To load data, set these filters:'}
            </Text>
            {unmetFilterRequirements.map((requirement, requirementIndex) => {
                const members = getRequirementMembers(requirement);
                return (
                    <Fragment key={getRequirementKey(requirement)}>
                        {requirementIndex > 0 && (
                            <Text size="xs" fw={600} c="ldGray.6">
                                AND
                            </Text>
                        )}
                        {members.length > 1 && (
                            <Text size="xs" c="ldGray.6">
                                at least one of
                            </Text>
                        )}
                        {members.map((member, memberIndex) => (
                            <Fragment key={member.id}>
                                {memberIndex > 0 && (
                                    <Text size="xs" c="ldGray.6">
                                        or
                                    </Text>
                                )}
                                <FilterNameTag
                                    filterRule={member}
                                    label={getDashboardFilterRuleLabel(
                                        member,
                                        fieldsMap,
                                    )}
                                    onClick={() => handleOpenFilter(member.id)}
                                />
                            </Fragment>
                        ))}
                    </Fragment>
                );
            })}
        </Group>
    );
};

export default RequiredFiltersBanner;
