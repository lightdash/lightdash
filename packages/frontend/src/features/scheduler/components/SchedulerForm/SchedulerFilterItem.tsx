import {
    FilterType,
    getFilterTypeFromItem,
    isFilterableItem,
    isWithValueFilter,
} from '@lightdash/common';
import {
    ActionIcon,
    Flex,
    Group,
    Paper,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconFilterPlus,
    IconPencil,
    IconRotate2,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FieldIcon from '../../../../components/common/Filters/FieldIcon';
import FieldLabel from '../../../../components/common/Filters/FieldLabel';
import FilterInputComponent from '../../../../components/common/Filters/FilterInputs';
import {
    getConditionalRuleLabelFromItem,
    getFilterOperatorOptions,
} from '../../../../components/common/Filters/FilterInputs/utils';
import useFiltersContext from '../../../../components/common/Filters/useFiltersContext';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    isValidFilterOperator,
    type SchedulerOverridableRule,
} from '../../utils/schedulerFilterOverrides';

const FilterSummaryLabel: FC<
    {
        filterSummary: ReturnType<typeof getConditionalRuleLabelFromItem>;
    } & Record<'isDisabled', boolean>
> = ({ filterSummary, isDisabled }) => {
    if (isDisabled) {
        return (
            <Text fw={400} span>
                <Text span c="dimmed">
                    is any value
                </Text>
            </Text>
        );
    }
    return (
        <Text fw={400} span>
            <Text span color="ldGray.7">
                {filterSummary?.operator}{' '}
            </Text>
            <Text fw={600} span>
                {filterSummary?.value}
            </Text>
        </Text>
    );
};

type SchedulerFilterItemProps<R extends SchedulerOverridableRule> = {
    savedFilter: R;
    schedulerFilter?: R;
    isMissingRequiredValue: boolean;
    onChange: (schedulerFilter: R) => void;
    onRevert: () => void;
    hasChanged: boolean;
    onRemove?: () => void;
    removeTooltip?: string;
    tilesWithFilter?: string[];
    /** Show the rule without any controls. */
    readOnly?: boolean;
};

export const SchedulerFilterItem = <R extends SchedulerOverridableRule>({
    savedFilter,
    schedulerFilter,
    isMissingRequiredValue,
    onChange,
    onRevert,
    hasChanged,
    onRemove,
    removeTooltip = 'Remove filter',
    tilesWithFilter,
    readOnly = false,
}: SchedulerFilterItemProps<R>) => {
    const { getField } = useFiltersContext();
    const item = getField(savedFilter);
    const field = item && isFilterableItem(item) ? item : undefined;
    const [isEditing, setIsEditing] = useState(false);

    const filterType = useMemo(() => {
        return field ? getFilterTypeFromItem(field) : FilterType.STRING;
    }, [field]);

    const isDisabled = useMemo(
        () => Boolean((schedulerFilter ?? savedFilter).disabled),
        [schedulerFilter, savedFilter],
    );

    const filterOperatorOptions = useMemo(() => {
        return getFilterOperatorOptions(filterType, field);
    }, [filterType, field]);

    if (!field) {
        return (
            <Group gap="xs" wrap="nowrap" justify="flex-start">
                <Paper key={savedFilter.id} p="xs" radius="md">
                    <Group gap="xs">
                        <MantineIcon icon={IconAlertTriangle} color="red" />
                        <Text span fw={500} fz="sm">
                            Invalid filter
                        </Text>
                        <Text fw={400} span fz="xs">
                            <Text span c="dimmed" fz="xs">
                                Tried to reference field with unknown id:
                            </Text>
                            <Text span fz="xs" fw={500}>
                                {' '}
                                {savedFilter.target.fieldId}
                            </Text>
                        </Text>
                    </Group>
                </Paper>
                {onRemove && (
                    <Tooltip label="Remove invalid filter" fz="xs">
                        <ActionIcon
                            size="xs"
                            aria-label="Remove invalid filter"
                            onClick={onRemove}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
        );
    }

    return (
        <Stack key={savedFilter.id} gap="xs">
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <Group gap="xs" flex={1} miw={0}>
                    <FieldIcon item={field} />
                    <FieldLabel
                        item={
                            savedFilter.label
                                ? { ...field, label: savedFilter.label }
                                : field
                        }
                        hideTableName
                    />
                    {isEditing ? null : (
                        <FilterSummaryLabel
                            filterSummary={getConditionalRuleLabelFromItem(
                                schedulerFilter ?? savedFilter,
                                field,
                            )}
                            isDisabled={isDisabled}
                        />
                    )}
                    {isMissingRequiredValue && !isEditing && (
                        <Text fz="sm" color="red">
                            *
                        </Text>
                    )}
                    {tilesWithFilter && tilesWithFilter.length > 0 && (
                        <Tooltip
                            label={`Applies to: ${tilesWithFilter.join(', ')}`}
                            fz="xs"
                            w={200}
                        >
                            <Text fz="xs" c="dimmed" span>
                                {`Applies to ${tilesWithFilter.length} tiles`}
                            </Text>
                        </Tooltip>
                    )}
                </Group>
                {!readOnly && (
                    <Group gap={4} wrap="nowrap">
                        {hasChanged && (
                            <Tooltip label="Reset filter" fz="xs">
                                <ActionIcon
                                    size="xs"
                                    aria-label="Reset filter"
                                    onClick={() => {
                                        if (isEditing) {
                                            setIsEditing(false);
                                        }
                                        onRevert();
                                    }}
                                >
                                    <MantineIcon icon={IconRotate2} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        <ActionIcon
                            size="xs"
                            aria-label={
                                isEditing ? 'Done editing' : 'Edit filter'
                            }
                            onClick={() => {
                                setIsEditing(!isEditing);
                            }}
                        >
                            <MantineIcon
                                icon={isEditing ? IconCheck : IconPencil}
                            />
                        </ActionIcon>
                        {onRemove && (
                            <Tooltip label={removeTooltip} fz="xs">
                                <ActionIcon
                                    size="xs"
                                    aria-label="Remove filter"
                                    onClick={onRemove}
                                >
                                    <MantineIcon icon={IconTrash} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                )}
            </Group>
            {!isEditing && hasChanged && (
                <Text fz="xs" c="dimmed">
                    Unsaved changes
                </Text>
            )}

            {isEditing && (
                <Flex gap="xs" wrap="wrap">
                    <Select
                        flex="0 0 180px"
                        size="xs"
                        value={
                            schedulerFilter?.operator ?? savedFilter.operator
                        }
                        data={filterOperatorOptions}
                        onChange={(operator: string | null) => {
                            if (!isValidFilterOperator(operator)) return;

                            onChange({
                                ...savedFilter,
                                operator,
                                values: isWithValueFilter(operator)
                                    ? savedFilter.values
                                    : undefined,
                            });
                        }}
                    />

                    <FilterInputComponent
                        filterType={filterType}
                        field={field}
                        rule={schedulerFilter ?? savedFilter}
                        onChange={(newFilter) => {
                            onChange(newFilter);
                        }}
                        popoverProps={{ withinPortal: true }}
                    />
                </Flex>
            )}
        </Stack>
    );
};

type RemovedSchedulerFilterItemProps<R extends SchedulerOverridableRule> = {
    savedFilter: R;
    defaultLabel: string;
    onRestore: () => void;
};

export const RemovedSchedulerFilterItem = <R extends SchedulerOverridableRule>({
    savedFilter,
    defaultLabel,
    onRestore,
}: RemovedSchedulerFilterItemProps<R>) => {
    const { getField } = useFiltersContext();
    const field = getField(savedFilter);

    if (!field) return null;

    return (
        <Group gap="xs" wrap="nowrap" align="flex-start">
            <Group gap="xs" opacity={0.5} flex={1} miw={0}>
                <FieldIcon item={field} />
                <FieldLabel
                    item={
                        savedFilter.label
                            ? { ...field, label: savedFilter.label }
                            : field
                    }
                    hideTableName
                />
                <Text fz="xs" c="dimmed" span>
                    {defaultLabel}
                </Text>
            </Group>
            <Tooltip
                label="Re-add filter to override it for this delivery"
                fz="xs"
            >
                <ActionIcon
                    size="xs"
                    aria-label="Re-add filter"
                    onClick={onRestore}
                >
                    <MantineIcon icon={IconFilterPlus} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
};
