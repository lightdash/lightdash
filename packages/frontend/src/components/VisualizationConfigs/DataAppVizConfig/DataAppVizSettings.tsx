import {
    getItemId,
    type DataAppViz,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type Item,
    type ItemsMap,
} from '@lightdash/common';
import { Stack, Text } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import DataAppVizLibraryPicker from '../../../features/apps/components/DataAppVizLibraryPicker';
import { poolKeyForSlot } from '../../../features/apps/utils/autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from '../../../features/apps/utils/getDataAppVizFieldItems';
import FieldSelect from '../../common/FieldSelect';
import { Config } from '../common/Config';

type Props = {
    projectUuid: string;
    /** The visualization the chart points at; empty when it points at none. */
    dataAppVizUuid: string;
    dataAppViz: DataAppViz | null;
    itemsMap: ItemsMap;
    /** The contract's declared slots. */
    fields: DataAppVizField[];
    /** The saved binding, reconciled against the contract in force now. */
    fieldMapping: DataAppVizFieldMapping;
    onSelect: (dataAppViz: DataAppViz | null) => void;
    onFieldChange: (fieldName: string, fieldId: string | null) => void;
};

/**
 * What the chart is pointing at, and what each of its slots is bound to.
 *
 * Changes here are free and instant — no build, no request. That is what
 * separates them from the build session docked below.
 */
const DataAppVizSettings: FC<Props> = ({
    projectUuid,
    dataAppVizUuid,
    dataAppViz,
    itemsMap,
    fields,
    fieldMapping,
    onSelect,
    onFieldChange,
}) => {
    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap),
        [itemsMap],
    );
    const itemPools = { dimension: dimensions, metric: metrics };
    const fieldItems = (field: DataAppVizField): Item[] =>
        itemPools[poolKeyForSlot(field)];
    // Auto-binding cannot run without columns, and it only runs once, at pick
    // time — so picking now would leave the slots empty for good.
    const hasColumns = dimensions.length > 0 || metrics.length > 0;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>Visualization</Config.Heading>
                    <DataAppVizLibraryPicker
                        projectUuid={projectUuid}
                        selectedDataAppVizUuid={dataAppVizUuid || null}
                        selectedDataAppViz={dataAppViz}
                        disabled={!hasColumns}
                        onSelect={onSelect}
                    />
                    {!hasColumns && (
                        <Text c="dimmed" size="xs">
                            Run your query to pick a visualization.
                        </Text>
                    )}
                </Config.Section>
            </Config>

            {dataAppVizUuid && fields.length === 0 && (
                <Text c="dimmed" size="sm">
                    This visualization has no fields to map.
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
