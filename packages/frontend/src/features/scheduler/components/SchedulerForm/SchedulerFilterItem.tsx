import {
    type FilterOperator,
    FilterType,
    getFilterTypeFromItem,
    getFilterTypeFromItemType,
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
    IconEyeOff,
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
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
    getFilterOperatorOptions,
} from '../../../../components/common/Filters/FilterInputs/utils';
import FilterOperatorOption from '../../../../components/common/Filters/FilterOperatorOption';
import useFiltersContext from '../../../../components/common/Filters/useFiltersContext';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import { type ResolvedSavedFilterField } from '../../../dashboardFilters/FilterConfiguration/utils';
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
            <Text span c="ldGray.7">
                {filterSummary?.operator}{' '}
            </Text>
            <Text fw={600} span>
                {filterSummary?.value}
            </Text>
        </Text>
    );
};

const HiddenFieldLabel: FC<{ label: string; hint: string }> = ({
    label,
    hint,
}) => (
    <Group gap={6} wrap="nowrap" miw={0}>
        <Tooltip label={hint} fz="xs" multiline maw={300}>
            <Group gap={6} wrap="nowrap" miw={0}>
                <MantineIcon icon={IconEyeOff} color="dimmed" />
                <Text span fw={500} fz="sm" truncate>
                    {label}
                </Text>
            </Group>
        </Tooltip>
    </Group>
);

type SchedulerFilterItemProps<R extends SchedulerOverridableRule> = {
    savedFilter: R;
    schedulerFilter?: R;
    modelHiddenField?: ResolvedSavedFilterField;
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
    modelHiddenField,
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
    const getUiString = useUiStrings();
    const item = getField(savedFilter);
    const field = item && isFilterableItem(item) ? item : undefined;
    const hiddenField = field ? undefined : modelHiddenField;
    const isNotEditable = !!hiddenField?.hasConflictingTypes;
    const hiddenLabel = savedFilter.label ?? savedFilter.target.fieldId;
    const [isEditing, setIsEditing] = useState(false);
    const showEditor = isEditing && !isNotEditable;

    const filterType = useMemo(() => {
        if (field) return getFilterTypeFromItem(field);
        return hiddenField
            ? getFilterTypeFromItemType(hiddenField.fallbackType)
            : FilterType.STRING;
    }, [field, hiddenField]);

    const isDisabled = useMemo(
        () => Boolean((schedulerFilter ?? savedFilter).disabled),
        [schedulerFilter, savedFilter],
    );

    const filterOperatorOptions = useMemo(() => {
        return getFilterOperatorOptions(filterType, field, getUiString);
    }, [filterType, field, getUiString]);

    if (!field && !hiddenField) {
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
                    {field ? (
                        <>
                            <FieldIcon item={field} />
                            <FieldLabel
                                item={
                                    savedFilter.label
                                        ? { ...field, label: savedFilter.label }
                                        : field
                                }
                                hideTableName
                            />
                        </>
                    ) : (
                        <HiddenFieldLabel
                            label={hiddenLabel}
                            hint={getUiString('filters.fieldHiddenInModel')}
                        />
                    )}
                    {showEditor ? null : (
                        <FilterSummaryLabel
                            filterSummary={
                                field
                                    ? getConditionalRuleLabelFromItem(
                                          schedulerFilter ?? savedFilter,
                                          field,
                                      )
                                    : getConditionalRuleLabel(
                                          schedulerFilter ?? savedFilter,
                                          filterType,
                                          hiddenLabel,
                                          getUiString,
                                      )
                            }
                            isDisabled={isDisabled}
                        />
                    )}
                    {isMissingRequiredValue && !showEditor && (
                        <Text fz="sm" c="red">
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
                        {!isNotEditable && (
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
                        )}
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
            {!showEditor && hasChanged && (
                <Text fz="xs" c="dimmed">
                    Unsaved changes
                </Text>
            )}

            {showEditor && (
                <Flex gap="xs" wrap="wrap">
                    <Select
                        flex="0 0 180px"
                        size="xs"
                        value={
                            schedulerFilter?.operator ?? savedFilter.operator
                        }
                        data={filterOperatorOptions}
                        renderOption={({ option }) => (
                            <FilterOperatorOption
                                operator={option.value as FilterOperator}
                                label={option.label}
                            />
                        )}
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
                        fallbackType={hiddenField?.fallbackType}
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
    modelHiddenField?: ResolvedSavedFilterField;
    defaultLabel: string;
    onRestore: () => void;
};

export const RemovedSchedulerFilterItem = <R extends SchedulerOverridableRule>({
    savedFilter,
    modelHiddenField,
    defaultLabel,
    onRestore,
}: RemovedSchedulerFilterItemProps<R>) => {
    const { getField } = useFiltersContext();
    const getUiString = useUiStrings();
    const field = getField(savedFilter);
    const hiddenField = field ? undefined : modelHiddenField;

    if (!field && !hiddenField) return null;

    return (
        <Group gap="xs" wrap="nowrap" align="flex-start">
            <Group gap="xs" opacity={0.5} flex={1} miw={0}>
                {field ? (
                    <>
                        <FieldIcon item={field} />
                        <FieldLabel
                            item={
                                savedFilter.label
                                    ? { ...field, label: savedFilter.label }
                                    : field
                            }
                            hideTableName
                        />
                    </>
                ) : (
                    <HiddenFieldLabel
                        label={savedFilter.label ?? savedFilter.target.fieldId}
                        hint={getUiString('filters.fieldHiddenInModel')}
                    />
                )}
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
