import {
    getItemId,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type Item,
    type ItemsMap,
} from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { useId, useMemo, type FC } from 'react';
import { poolKeyForSlot } from '../../../features/chartTypes/utils/autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from '../../../features/chartTypes/utils/getDataAppVizFieldItems';
import FieldSelect from '../../common/FieldSelect';
import { Config } from '../common/Config';
import { useAddFieldsToQuery } from '../common/useAddFieldsToQuery';
import DataAppVizFieldGuidance, {
    DataAppVizFieldHelp,
} from './DataAppVizFieldGuidance';
import OrderedDataAppVizFieldSelect from './OrderedDataAppVizFieldSelect';

type Props = {
    itemsMap: ItemsMap;
    /** The contract's declared slots. */
    fields: DataAppVizField[];
    /** The saved binding, reconciled against the contract in force now. */
    fieldMapping: DataAppVizFieldMapping;
    onFieldChange: (
        fieldName: string,
        fieldId: string | string[] | null,
    ) => void;
};

/**
 * What each of the selected type's slots is bound to.
 *
 * Changes here are free and instant — no build, no request. That is what
 * separates them from the build session docked below.
 */
const DataAppVizSettings: FC<Props> = ({
    itemsMap,
    fields,
    fieldMapping,
    onFieldChange,
}) => {
    const guidanceIdPrefix = useId();
    const { addableItems, addFieldToQuery, isFieldPending } =
        useAddFieldsToQuery();

    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap),
        [itemsMap],
    );
    // The hook already drops hidden fields, mirroring the in-query pools.
    // `column` slots accept any field; metrics first, matching automap.
    const addPools = useMemo(() => {
        const dimension = addableItems.filter(
            (item) => isDimension(item) || isCustomDimension(item),
        );
        const metric = addableItems.filter(
            (item) => isMetric(item) || isTableCalculation(item),
        );
        return { dimension, metric, column: [...metric, ...dimension] };
    }, [addableItems]);
    const itemPools = {
        dimension: dimensions,
        metric: metrics,
        column: [...metrics, ...dimensions],
    };
    const fieldItems = (field: DataAppVizField): Item[] =>
        itemPools[poolKeyForSlot(field)];

    return (
        <Stack>
            {fields.length === 0 && (
                <Text c="dimmed" size="sm">
                    This chart type has no fields to map.
                </Text>
            )}

            {fields.map((field) => {
                const guidanceId = field.description?.trim()
                    ? `${guidanceIdPrefix}-${field.name}`
                    : undefined;
                const items = fieldItems(field);
                const addItems = addPools[poolKeyForSlot(field)];
                const selectedValue = fieldMapping[field.name];
                const selectedIds = Array.isArray(selectedValue)
                    ? selectedValue
                    : selectedValue
                      ? [selectedValue]
                      : [];
                const selectedItem = !Array.isArray(selectedValue) && selectedValue
                    ? (items.find((i) => getItemId(i) === selectedValue) ??
                      addItems.find((i) => getItemId(i) === selectedValue))
                    : undefined;
                return (
                    <Config key={field.name}>
                        <Config.Section>
                            <Group gap="xxs">
                                <Config.Heading>{field.label}</Config.Heading>
                                <DataAppVizFieldHelp field={field} />
                            </Group>
                            <DataAppVizFieldGuidance
                                field={field}
                                id={guidanceId}
                            />
                            {field.multiple ? (
                                <OrderedDataAppVizFieldSelect
                                    label={field.label}
                                    items={items}
                                    addItems={addItems}
                                    selectedIds={selectedIds}
                                    describedBy={guidanceId}
                                    addDisabled={
                                        items.length === 0 &&
                                        addItems.length === 0
                                    }
                                    loading={selectedIds.some(isFieldPending)}
                                    onAddToQuery={addFieldToQuery}
                                    onChange={(ids) =>
                                        onFieldChange(field.name, ids)
                                    }
                                />
                            ) : (
                                <FieldSelect
                                    size="xs"
                                    aria-label={field.label}
                                    aria-describedby={guidanceId}
                                    // A disabled, empty select says nothing on its
                                    // own; the placeholder names what the chart is
                                    // missing, as the cartesian layout does.
                                    placeholder={
                                        items.length === 0 &&
                                        addItems.length === 0
                                            ? `You need at least one ${poolKeyForSlot(field)} in your chart to set this field`
                                            : `Select ${field.label.toLowerCase()}`
                                    }
                                    disabled={
                                        items.length === 0 &&
                                        addItems.length === 0
                                    }
                                    item={selectedItem}
                                    items={items}
                                    addItems={addItems}
                                    loading={
                                        typeof selectedValue === 'string' &&
                                        isFieldPending(selectedValue)
                                    }
                                    onChange={(newField) => {
                                        if (
                                            newField &&
                                            !items.some(
                                                (i) =>
                                                    getItemId(i) ===
                                                    getItemId(newField),
                                            )
                                        ) {
                                            addFieldToQuery(newField);
                                        }
                                        onFieldChange(
                                            field.name,
                                            newField ? getItemId(newField) : null,
                                        );
                                    }}
                                    clearable={!field.required}
                                    hasGrouping
                                />
                            )}
                        </Config.Section>
                    </Config>
                );
            })}
        </Stack>
    );
};

export default DataAppVizSettings;
