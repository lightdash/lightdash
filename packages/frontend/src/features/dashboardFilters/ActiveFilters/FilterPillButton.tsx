import {
    isValuelessDashboardFilterRule,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { ActionIcon, Button, Group, Tooltip } from '@mantine/core';
import {
    IconCircleCheck,
    IconCircleDashed,
    IconGripVertical,
    IconLock,
    IconLockOpen,
    IconX,
} from '@tabler/icons-react';
import {
    forwardRef,
    useMemo,
    type ComponentPropsWithoutRef,
    type MouseEvent,
} from 'react';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import { getFieldColor } from '../../../utils/fieldColors';
import { useFilterChipRequirementState } from '../FilterRequirements/useFilterChipRequirementState';
import classes from './Filter.module.css';
import { showsComposedFilterValue } from './filterLabels';
import { FilterRuleLabel } from './FilterRuleLabel';
import { getTruncatedValuesDisplay } from './utils';

type Props = Omit<
    ComponentPropsWithoutRef<'button'>,
    'children' | 'onClick' | 'color'
> & {
    field: DashboardFilterableField | undefined;
    filterRule: DashboardFilterRule;
    isOrphaned: boolean;
    isTemporary: boolean;
    isDraggable: boolean;
    isLocked: boolean;
    /** The lock action's label; null leaves the action out. */
    lockLabel: string | null;
    onLockToggle: (e: MouseEvent) => void;
    /** The label of the read-only lock icon; null leaves it out. */
    readOnlyLockLabel: string | null;
    /** Null leaves the X out. */
    onRemove: ((e: MouseEvent) => void) | null;
    /** Names the X and gives it a tooltip; default: neither. */
    removeLabel?: string;
    isTablesTooltipDisabled: boolean;
    triggerClassName?: string;
    onClick: () => void;
};

// The pill of a dashboard filter on the filter bar
export const FilterPillButton = forwardRef<HTMLButtonElement, Props>(
    (
        {
            field,
            filterRule,
            isOrphaned,
            isTemporary,
            isDraggable,
            isLocked,
            lockLabel,
            onLockToggle,
            readOnlyLockLabel,
            onRemove,
            removeLabel,
            isTablesTooltipDisabled,
            triggerClassName,
            className,
            onClick,
            ...others
        },
        ref,
    ) => {
        const showsComposedValue = useMemo(
            () =>
                showsComposedFilterValue(
                    field?.type,
                    filterRule.target.fallbackType,
                ),
            [field?.type, filterRule.target.fallbackType],
        );

        // Truncated values display - show max 2 values with "+N" badge
        const truncatedValuesDisplay = useMemo(
            () =>
                getTruncatedValuesDisplay(
                    filterRule.values,
                    showsComposedValue,
                    filterRule.operator,
                ),
            [filterRule.values, filterRule.operator, showsComposedValue],
        );

        const { showRequirementIcon, isRequirementUnmet, requirementTooltip } =
            useFilterChipRequirementState(filterRule);

        // Same predicate as requirement checks, so a pill is never both active and unmet
        const isActive = !isValuelessDashboardFilterRule(filterRule);
        const statusColor = isRequirementUnmet
            ? 'yellow.7'
            : isActive && field
              ? getFieldColor(field)
              : 'dimmed';

        const removeAction = onRemove && (
            <ActionIcon
                onClick={onRemove}
                size="xs"
                radius="xl"
                className={classes.pillAction}
                aria-label={removeLabel}
            >
                <MantineIcon size="sm" icon={IconX} />
            </ActionIcon>
        );

        return (
            <Button
                ref={ref}
                {...others}
                data-dashboard-filter-control
                data-filter-active={isActive || undefined}
                data-requirement-unmet={isRequirementUnmet || undefined}
                pos="relative"
                size="xs"
                variant={isTemporary ? 'outline' : 'default'}
                classNames={{
                    label: classes.label,
                    root: triggerClassName,
                }}
                className={`${classes.button} ${
                    isOrphaned ? classes.inactiveFilter : ''
                }${className ? ` ${className}` : ''}`}
                pr={truncatedValuesDisplay.hasMore ? 6 : undefined}
                leftSection={
                    (isDraggable || showRequirementIcon || field) && (
                        <Group gap={4} wrap="nowrap">
                            {isDraggable && (
                                <MantineIcon
                                    icon={IconGripVertical}
                                    cursor="grab"
                                    size="sm"
                                />
                            )}
                            {showRequirementIcon && (
                                <Tooltip
                                    fz="xs"
                                    label={requirementTooltip}
                                    disabled={!isRequirementUnmet}
                                >
                                    <MantineIcon
                                        icon={
                                            isRequirementUnmet
                                                ? IconCircleDashed
                                                : IconCircleCheck
                                        }
                                        size="sm"
                                        color={statusColor}
                                        className={classes.statusIcon}
                                    />
                                </Tooltip>
                            )}
                            {field && (
                                <FieldIcon
                                    item={field}
                                    size="sm"
                                    color={statusColor}
                                    className={classes.statusIcon}
                                />
                            )}
                        </Group>
                    )
                }
                rightSection={
                    <Group gap={2} wrap="nowrap">
                        {lockLabel !== null && (
                            <span
                                className={
                                    isLocked
                                        ? classes.lockSlotActive
                                        : classes.lockSlot
                                }
                            >
                                <Tooltip fz="xs" label={lockLabel}>
                                    <ActionIcon
                                        onClick={onLockToggle}
                                        size="xs"
                                        radius="xl"
                                        className={classes.pillAction}
                                        aria-label={lockLabel}
                                    >
                                        <MantineIcon
                                            size="sm"
                                            icon={
                                                isLocked
                                                    ? IconLock
                                                    : IconLockOpen
                                            }
                                            color={
                                                isLocked
                                                    ? statusColor
                                                    : undefined
                                            }
                                            className={classes.statusIcon}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            </span>
                        )}
                        {readOnlyLockLabel !== null && (
                            <span
                                className={classes.lockSlotActive}
                                aria-label={readOnlyLockLabel}
                            >
                                <MantineIcon
                                    size="sm"
                                    icon={IconLock}
                                    color={statusColor}
                                    className={classes.statusIcon}
                                />
                            </span>
                        )}
                        {removeAction &&
                            (removeLabel ? (
                                <Tooltip fz="xs" label={removeLabel}>
                                    {removeAction}
                                </Tooltip>
                            ) : (
                                removeAction
                            ))}
                    </Group>
                }
                onClick={onClick}
            >
                <FilterRuleLabel
                    filterRule={filterRule}
                    field={field}
                    truncatedValuesDisplay={truncatedValuesDisplay}
                    isTablesTooltipDisabled={isTablesTooltipDisabled}
                />
            </Button>
        );
    },
);
FilterPillButton.displayName = 'FilterPillButton';
