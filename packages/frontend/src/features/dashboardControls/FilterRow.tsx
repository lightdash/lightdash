import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Group, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { useId, type FC } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../components/common/PolymorphicGroupButton';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectSqlChartTilesMetadata,
    useDashboardSelector,
} from '../dashboard/store';
import { useFilterChipRequirementState } from '../dashboardFilters/FilterRequirements/useFilterChipRequirementState';
import classes from './ControlSidebar.module.css';
import { getFilterRuleSummary } from './railSummaries';

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
    /** A viewer's own filter, never saved. */
    isOwn: boolean;
    /**
     * Opens nothing, as its pill: a viewer's row on a locked filter, or a
     * filter whose field cannot be resolved.
     */
    isReadOnly: boolean;
    /** Why a read-only row opens nothing, as its pill's tooltip says. */
    readOnlyTooltip: string | null;
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
    isOwn,
    isReadOnly,
    readOnlyTooltip,
    isDisabled,
    onOpen,
    onHover,
    onUnhover,
}) => {
    const getUiString = useUiStrings();
    const descriptionId = useId();
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
    // As the pill reads it: a group member whose alternative is set is met
    const {
        showRequirementIcon: isRequired,
        isRequirementUnmet,
        requirementTooltip,
    } = useFilterChipRequirementState(rule);

    const lockedLabel = getUiString(
        hasTabs ? 'filters.filterIsLockedOnTab' : 'filters.filterIsLocked',
    );

    const content = (
        <>
            <FilterTypeIcon field={field} />
            <Stack gap={0} miw={0}>
                <Text fz="sm" fw={600} truncate>
                    {summary.name}
                </Text>
                <Text fz="xs" c="dimmed" truncate>
                    {isRequirementUnmet ? (
                        <>
                            {isLocked && `${lockedLabel} · `}
                            <Text span inherit className={classes.required}>
                                {requirementTooltip}
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
                                        {getUiString('filters.rail.required')}
                                    </Text>
                                </>
                            )}
                        </>
                    )}
                </Text>
                {isOwn && (
                    <Text fz="xs" c="dimmed" truncate>
                        {getUiString('filters.rail.addedByYou')}
                    </Text>
                )}
            </Stack>
        </>
    );

    if (isReadOnly) {
        // Hovering still shows its tiles. A disabled button, named by its
        // content and described by why it opens nothing
        return (
            <>
                <Tooltip
                    label={readOnlyTooltip}
                    disabled={readOnlyTooltip === null}
                    fz="xs"
                    maw={300}
                    position="top-start"
                >
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        align="flex-start"
                        className={`${classes.row} ${classes.readOnlyRow}`}
                        data-controls-row={rule.id}
                        role="button"
                        tabIndex={0}
                        aria-disabled
                        aria-describedby={
                            readOnlyTooltip === null ? undefined : descriptionId
                        }
                        onMouseEnter={() => onHover(rule.id)}
                        onMouseLeave={() => onUnhover(rule.id)}
                        onFocus={(event) => {
                            if (event.currentTarget.matches(':focus-visible'))
                                onHover(rule.id);
                        }}
                        onBlur={() => onUnhover(rule.id)}
                    >
                        {content}
                    </Group>
                </Tooltip>
                {readOnlyTooltip !== null && (
                    <VisuallyHidden id={descriptionId}>
                        {readOnlyTooltip}
                    </VisuallyHidden>
                )}
            </>
        );
    }

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
            {content}
        </PolymorphicGroupButton>
    );
};
