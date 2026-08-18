import {
    getItemId,
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

type Props = {
    /** The visualization the chart points at; empty when it points at none. */
    dataAppVizUuid: string;
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
    dataAppVizUuid,
    itemsMap,
    fields,
    fieldMapping,
    onFieldChange,
}) => {
    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap),
        [itemsMap],
    );
    const itemPools = { dimension: dimensions, metric: metrics };
    const fieldItems = (field: DataAppVizField): Item[] =>
        itemPools[poolKeyForSlot(field)];

    return (
        <Stack>
            {dataAppVizUuid && fields.length === 0 && (
                <Text c="dimmed" size="sm">
                    This chart type has no fields to map.
                </Text>
            )}

            {fields.map((field) => {
                const items = fieldItems(field);
                const selectedId = fieldMapping[field.name];
                const selectedItem = selectedId
                    ? items.find((i) => getItemId(i) === selectedId)
                    : undefined;
                return (
                    <Config key={field.name}>
                        <Config.Section>
                            <Config.Heading>{field.label}</Config.Heading>
                            <FieldSelect
                                placeholder={`Select ${field.label.toLowerCase()}`}
                                disabled={items.length === 0}
                                item={selectedItem}
                                items={items}
                                onChange={(newField) =>
                                    onFieldChange(
                                        field.name,
                                        newField ? getItemId(newField) : null,
                                    )
                                }
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
