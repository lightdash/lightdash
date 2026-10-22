import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../components/common/PolymorphicGroupButton';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectSqlChartTilesMetadata,
    useDashboardSelector,
} from '../dashboard/store';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';
import classes from './ControlSidebar.module.css';
import { getFilterRuleSummary } from './railSummaries';
import { isRuleRequired } from './requirements';

export const FilterTypeIcon: FC<{ field: DashboardFilterableField | null }> = ({
    field,
}) =>
    field !== null ? (
        <FieldIcon item={field} size={14} className={classes.rowIcon} />
    ) : (
        <MantineIcon
            icon={IconFilter}
            size={14}
            color="dimmed"
            className={classes.rowIcon}
        />
    );

type Props = {
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    activeTabUuid: string | undefined;
    hasTabs: boolean;
    /** Its field cannot be resolved, or the fields are not loaded yet. */
    isDisabled: boolean;
    onOpen: (filterId: string) => void;
    /** The row's filter under the pointer or focus. */
    onHover: (filterId: string) => void;
    /** The pointer or focus left the row. */
    onUnhover: (filterId: string) => void;
};

// A filter that is not being edited: its name and one line of what it does
export const FilterRow: FC<Props> = ({
    rule,
    field,
    activeTabUuid,
    hasTabs,
    isDisabled,
    onOpen,
    onHover,
    onUnhover,
}) => {
    const getUiString = useUiStrings();
    const sqlChartTilesMetadata = useDashboardSelector(
        selectSqlChartTilesMetadata,
    );
    const summary = getFilterRuleSummary(
        rule,
        field ?? undefined,
        sqlChartTilesMetadata,
        getUiString,
    );
    const isLocked = isFilterLockedOnTab(rule, activeTabUuid, hasTabs);
    const isRequired = isRuleRequired(rule);
    const isMissingValue = isRequired && !hasFilterValueSet(rule);

    const lockedLabel = getUiString(
        hasTabs ? 'filters.filterIsLockedOnTab' : 'filters.filterIsLocked',
    );

    return (
        <PolymorphicGroupButton
            component="button"
            type="button"
            gap="xs"
            wrap="nowrap"
            align="flex-start"
            className={classes.row}
            disabled={isDisabled}
            data-controls-row={rule.id}
            aria-expanded={false}
            onClick={() => onOpen(rule.id)}
            onMouseEnter={() => onHover(rule.id)}
            onMouseLeave={() => onUnhover(rule.id)}
            // Keyboard focus only: focus handed back after a click lights nothing
            onFocus={(event) => {
                if (event.currentTarget.matches(':focus-visible'))
                    onHover(rule.id);
            }}
            onBlur={() => onUnhover(rule.id)}
        >
            <FilterTypeIcon field={field} />
            <Stack gap={0} miw={0}>
                <Text fz="sm" fw={600} truncate>
                    {summary.name}
                </Text>
                <Text fz="xs" c="dimmed" truncate>
                    {isMissingValue ? (
                        <>
                            {isLocked && `${lockedLabel} · `}
                            <Text span inherit className={classes.required}>
                                {getUiString(
                                    'filters.required.setValueTooltip',
                                )}
                            </Text>
                        </>
                    ) : (
                        <>
                            {summary.value}
                            {isLocked && ` · ${lockedLabel}`}
                            {isRequired && (
                                <>
                                    {' · '}
                                    <Text
                                        span
                                        inherit
                                        className={classes.required}
                                    >
                                        Required
                                    </Text>
                                </>
                            )}
                        </>
                    )}
                </Text>
            </Stack>
        </PolymorphicGroupButton>
    );
};
