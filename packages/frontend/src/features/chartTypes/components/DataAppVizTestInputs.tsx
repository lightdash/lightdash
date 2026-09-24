import {
    getDataAppVizFieldIds,
    getItemId,
    getItemLabelWithoutTableName,
    isNumericItem,
    type DataAppVizSchema,
} from '@lightdash/common';
import { Group, Select, Stack, Text } from '@mantine/core';
import { useId, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import DataAppVizFieldGuidance, {
    DataAppVizFieldHelp,
} from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizFieldGuidance';
import DataAppVizFieldOptionControls from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizFieldOptionControls';
import DataAppVizGradientControl from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizGradientControl';
import DataAppVizInputGuidance from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizInputGuidance';
import DataAppVizRulesControl from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizRulesControl';
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
        effectiveFieldOptions,
        effectiveFieldColors,
        setFieldOption,
        setFieldGradient,
        setFieldRules,
        colorPalette,
    } = state;

    return (
        <Stack gap="xs">
            <Select
                size="xs"
                label="Test with data"
                placeholder="Select a table"
                searchable
                data={exploreOptions}
                value={exploreName}
                onChange={handleExploreChange}
            />

            <Stack gap="xs">
                {schema.fields.map((field) => {
                    const configOptions = field.configOptions ?? [];
                    const declaredGradient = field.colorOptions?.gradient;
                    const declaredRules = field.colorOptions?.rules;
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
                    const selectedIds = getDataAppVizFieldIds(selectedValue);
                    const selectedItem =
                        typeof selectedValue === 'string'
                            ? items.find((i) => getItemId(i) === selectedValue)
                            : undefined;
                    return (
                        <Stack key={field.name} gap={2}>
                            {!exploreName && (
                                <>
                                    <Group gap="xs">
                                        <Text size="xs" fw={500}>
                                            {field.label}
                                        </Text>
                                        <DataAppVizFieldTypeBadge
                                            type={field.type}
                                        />
                                        <DataAppVizFieldHelp field={field} />
                                    </Group>
                                    <DataAppVizFieldGuidance
                                        field={field}
                                        id={guidanceId}
                                    />
                                </>
                            )}
                            {exploreName &&
                                (field.multiple ? (
                                    <OrderedDataAppVizFieldSelect
                                        header={
                                            <Stack gap={2} flex={1}>
                                                <Group gap="xs">
                                                    <Text size="xs" fw={500}>
                                                        {field.label}
                                                    </Text>
                                                    <DataAppVizFieldTypeBadge
                                                        type={field.type}
                                                    />
                                                    <DataAppVizFieldHelp
                                                        field={field}
                                                    />
                                                </Group>
                                                <DataAppVizFieldGuidance
                                                    field={field}
                                                    id={guidanceId}
                                                />
                                            </Stack>
                                        }
                                        label={field.label}
                                        items={items}
                                        selectedIds={selectedIds}
                                        describedBy={guidanceId}
                                        addDisabled={items.length === 0}
                                        emptyPlaceholder={`You need at least one ${poolKeyForSlot(field)} in the selected table`}
                                        onChange={(ids) =>
                                            setField(field.name, ids)
                                        }
                                    />
                                ) : (
                                    <>
                                        <Group gap="xs">
                                            <Text size="xs" fw={500}>
                                                {field.label}
                                            </Text>
                                            <DataAppVizFieldTypeBadge
                                                type={field.type}
                                            />
                                            <DataAppVizFieldHelp
                                                field={field}
                                            />
                                        </Group>
                                        <DataAppVizFieldGuidance
                                            field={field}
                                            id={guidanceId}
                                        />
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
                                    </>
                                ))}
                            {exploreName && (
                                <>
                                    <DataAppVizFieldOptionControls
                                        options={configOptions}
                                        fieldIds={selectedIds}
                                        items={items}
                                        values={
                                            effectiveFieldOptions[field.name] ??
                                            {}
                                        }
                                        colorPalette={colorPalette}
                                        onChange={(
                                            fieldId,
                                            optionName,
                                            value,
                                        ) =>
                                            setFieldOption(
                                                field.name,
                                                fieldId,
                                                optionName,
                                                value,
                                            )
                                        }
                                    />
                                    {(declaredGradient ||
                                        declaredRules !== undefined) &&
                                        selectedIds.map((fieldId) => {
                                            const boundItem = items.find(
                                                (candidate) =>
                                                    getItemId(candidate) ===
                                                    fieldId,
                                            );
                                            if (
                                                !boundItem ||
                                                !isNumericItem(boundItem)
                                            )
                                                return null;
                                            return (
                                                <Stack
                                                    key={fieldId}
                                                    gap="xs"
                                                    mt="xs"
                                                >
                                                    {configOptions.length ===
                                                        0 && (
                                                        <Text
                                                            size="xs"
                                                            fw={600}
                                                        >
                                                            {getItemLabelWithoutTableName(
                                                                boundItem,
                                                            )}
                                                        </Text>
                                                    )}
                                                    {declaredGradient && (
                                                        <DataAppVizGradientControl
                                                            value={
                                                                effectiveFieldColors[
                                                                    field.name
                                                                ]?.[fieldId]
                                                                    ?.gradient ??
                                                                declaredGradient
                                                            }
                                                            colorPalette={
                                                                colorPalette
                                                            }
                                                            onChange={(patch) =>
                                                                setFieldGradient(
                                                                    field.name,
                                                                    fieldId,
                                                                    declaredGradient,
                                                                    patch,
                                                                )
                                                            }
                                                        />
                                                    )}
                                                    {declaredRules !==
                                                        undefined && (
                                                        <DataAppVizRulesControl
                                                            value={
                                                                effectiveFieldColors[
                                                                    field.name
                                                                ]?.[fieldId]
                                                                    ?.rules ??
                                                                declaredRules
                                                            }
                                                            colorPalette={
                                                                colorPalette
                                                            }
                                                            onChange={(
                                                                update,
                                                            ) =>
                                                                setFieldRules(
                                                                    field.name,
                                                                    fieldId,
                                                                    declaredRules,
                                                                    update,
                                                                )
                                                            }
                                                        />
                                                    )}
                                                </Stack>
                                            );
                                        })}
                                </>
                            )}
                        </Stack>
                    );
                })}
            </Stack>
            <DataAppVizInputGuidance guidance={schema.inputGuidance} />
        </Stack>
    );
};

export default DataAppVizTestInputs;
