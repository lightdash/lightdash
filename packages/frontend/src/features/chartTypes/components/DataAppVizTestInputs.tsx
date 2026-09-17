import { getItemId, type DataAppVizSchema } from '@lightdash/common';
import { Group, Select, Stack, Text } from '@mantine/core';
import { useId, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import DataAppVizFieldGuidance from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizFieldGuidance';
import { type DataAppVizTestContextState } from '../hooks/useDataAppVizTestContext';
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
            {schema.inputGuidance && (
                <Text size="xs" c="dimmed" lh={1.4}>
                    {schema.inputGuidance}
                </Text>
            )}
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
                    const guidanceId = `${guidanceIdPrefix}-${field.name}`;
                    const items =
                        field.type === 'metric' ? metrics : dimensions;
                    const selectedId = fieldMapping[field.name];
                    const selectedItem = selectedId
                        ? items.find((i) => getItemId(i) === selectedId)
                        : undefined;
                    return (
                        <Stack key={field.name} gap={2}>
                            <Group gap="xs">
                                <Text size="xs" fw={500}>
                                    {field.label}
                                </Text>
                                <DataAppVizFieldTypeBadge type={field.type} />
                            </Group>
                            <DataAppVizFieldGuidance
                                field={field}
                                id={guidanceId}
                                showMappingHint={!selectedId}
                            />
                            {exploreName && (
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
                            )}
                        </Stack>
                    );
                })}
            </Stack>
        </Stack>
    );
};

export default DataAppVizTestInputs;
