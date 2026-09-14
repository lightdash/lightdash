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
import { Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { poolKeyForSlot } from '../../../features/chartTypes/utils/autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from '../../../features/chartTypes/utils/getDataAppVizFieldItems';
import FieldSelect from '../../common/FieldSelect';
import { Config } from '../common/Config';
import { useAddFieldsToQuery } from '../common/useAddFieldsToQuery';

type Props = {
    itemsMap: ItemsMap;
    /** The contract's declared slots. */
    fields: DataAppVizField[];
    /** The saved binding, reconciled against the contract in force now. */
    fieldMapping: DataAppVizFieldMapping;
    onFieldChange: (fieldName: string, fieldId: string | null) => void;
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
    const { addableItems, addFieldToQuery, isFieldPending } =
        useAddFieldsToQuery();

    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap),
        [itemsMap],
    );
    // The hook already drops hidden fields, mirroring the in-query pools.
    const addPools = useMemo(
        () => ({
            dimension: addableItems.filter(
                (item) => isDimension(item) || isCustomDimension(item),
            ),
            metric: addableItems.filter(
                (item) => isMetric(item) || isTableCalculation(item),
            ),
        }),
        [addableItems],
    );
    const itemPools = { dimension: dimensions, metric: metrics };
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
                const items = fieldItems(field);
                const addItems = addPools[poolKeyForSlot(field)];
                const selectedId = fieldMapping[field.name];
                const selectedItem = selectedId
                    ? (items.find((i) => getItemId(i) === selectedId) ??
                      addItems.find((i) => getItemId(i) === selectedId))
                    : undefined;
                return (
                    <Config key={field.name}>
                        <Config.Section>
                            <Config.Heading>{field.label}</Config.Heading>
                            <FieldSelect
                                size="xs"
                                // A disabled, empty select says nothing on its
                                // own; the placeholder names what the chart is
                                // missing, as the cartesian layout does.
                                placeholder={
                                    items.length === 0 && addItems.length === 0
                                        ? `You need at least one ${poolKeyForSlot(field)} in your chart to set this field`
                                        : `Select ${field.label.toLowerCase()}`
                                }
                                disabled={
                                    items.length === 0 && addItems.length === 0
                                }
                                item={selectedItem}
                                items={items}
                                addItems={addItems}
                                loading={isFieldPending(selectedId)}
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
                        </Config.Section>
                    </Config>
                );
            })}
        </Stack>
    );
};

export default DataAppVizSettings;
