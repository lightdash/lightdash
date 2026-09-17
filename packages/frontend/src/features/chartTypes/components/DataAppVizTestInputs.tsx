import { getItemId, type DataAppVizSchema } from '@lightdash/common';
import { Group, Select, Stack, Text } from '@mantine/core';
import { useId, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import DataAppVizFieldGuidance, {
    DataAppVizFieldHelp,
} from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizFieldGuidance';
import DataAppVizInputGuidance from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizInputGuidance';
import OrderedDataAppVizFieldSelect from '../../../components/VisualizationConfigs/DataAppVizConfig/OrderedDataAppVizFieldSelect';
import { type DataAppVizTestContextState } from '../hooks/useDataAppVizTestContext';
import { poolKeyForSlot } from '../utils/autoMapDataAppVizFields';
import DataAppVizFieldTypeBadge from './DataAppVizFieldTypeBadge';

type Props = {
    schema: DataAppVizSchema;
    state: DataAppVizTestContextState;
};

/** Explore picker + one field select per declared slot, feeding the test
 *  context's mapping. */
const DataAppVizTestInputs: FC<Props> = ({ schema, state }) => {
    const guidanceIdPrefix = useId();
    const {
        exploreName,
        exploreOptions,
        handleExploreChange,
        fieldMapping,
        setField,
        dimensions,
        metrics,
    } = state;

    return (
        <Stack gap="xs">
            <Select
                size="xs"
                label="Test with data"
                placeholder="Select an explore"
                searchable
                data={exploreOptions}
                value={exploreName}
                onChange={handleExploreChange}
            />

            <Stack gap="xs">
                {schema.fields.map((field) => {
                    const guidanceId = field.description?.trim()
                        ? `${guidanceIdPrefix}-${field.name}`
                        : undefined;
                    const items =
                        poolKeyForSlot(field) === 'metric'
                            ? metrics
                            : poolKeyForSlot(field) === 'dimension'
                              ? dimensions
                              : [...metrics, ...dimensions];
                    const selectedValue = fieldMapping[field.name];
                    const selectedIds = Array.isArray(selectedValue)
                        ? selectedValue
                        : selectedValue
                          ? [selectedValue]
                          : [];
                    const selectedItem =
                        !Array.isArray(selectedValue) && selectedValue
                            ? items.find((i) => getItemId(i) === selectedValue)
                            : undefined;
                    return (
                        <Stack key={field.name} gap={2}>
                            <Group gap="xs">
                                <Text size="xs" fw={500}>
                                    {field.label}
                                </Text>
                                <DataAppVizFieldTypeBadge type={field.type} />
                                <DataAppVizFieldHelp field={field} />
                            </Group>
                            <DataAppVizFieldGuidance
                                field={field}
                                id={guidanceId}
                            />
                            {exploreName &&
                                (field.multiple ? (
                                    <OrderedDataAppVizFieldSelect
                                        label={field.label}
                                        items={items}
                                        selectedIds={selectedIds}
                                        describedBy={guidanceId}
                                        addDisabled={items.length === 0}
                                        onChange={(ids) =>
                                            setField(field.name, ids)
                                        }
                                    />
                                ) : (
                                    <FieldSelect
                                        size="xs"
                                        aria-label={field.label}
                                        aria-describedby={guidanceId}
                                        placeholder={`Select ${field.label.toLowerCase()}`}
                                        disabled={items.length === 0}
                                        item={selectedItem}
                                        items={items}
                                        onChange={(newField) =>
                                            setField(
                                                field.name,
                                                newField
                                                    ? getItemId(newField)
                                                    : null,
                                            )
                                        }
                                        clearable={!field.required}
                                        hasGrouping
                                    />
                                ))}
                        </Stack>
                    );
                })}
            </Stack>
            <DataAppVizInputGuidance guidance={schema.inputGuidance} />
        </Stack>
    );
};

export default DataAppVizTestInputs;
