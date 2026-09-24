import {
    getItemId,
    getItemLabelWithoutTableName,
    getDataAppVizFieldIds,
    getEffectiveDataAppVizFieldOptionValues,
    getEffectiveDataAppVizFieldColorValues,
    isCustomDimension,
    isDimension,
    isMetric,
    isNumericItem,
    isTableCalculation,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type DataAppVizFieldOptionValues,
    type DataAppVizFieldColorValues,
    type DataAppVizColorGradient,
    type DataAppVizColorRule,
    type DataAppVizOptionValue,
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
import DataAppVizFieldOptionControls from './DataAppVizFieldOptionControls';
import DataAppVizGradientControl from './DataAppVizGradientControl';
import DataAppVizRulesControl from './DataAppVizRulesControl';
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
    fieldOptionValues: DataAppVizFieldOptionValues;
    fieldColorValues: DataAppVizFieldColorValues;
    colorPalette: string[];
    onFieldOptionChange: (
        fieldName: string,
        fieldId: string,
        optionName: string,
        value: DataAppVizOptionValue,
    ) => void;
    onFieldGradientChange: (
        fieldName: string,
        fieldId: string,
        declaredDefault: DataAppVizColorGradient,
        patch: Partial<DataAppVizColorGradient>,
    ) => void;
    onFieldRulesChange: (
        fieldName: string,
        fieldId: string,
        declaredDefault: DataAppVizColorRule[],
        update: (rules: DataAppVizColorRule[]) => DataAppVizColorRule[],
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
    fieldOptionValues,
    fieldColorValues,
    colorPalette,
    onFieldOptionChange,
    onFieldGradientChange,
    onFieldRulesChange,
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
    const effectiveFieldOptions = getEffectiveDataAppVizFieldOptionValues(
        fields,
        fieldMapping,
        fieldOptionValues,
    );
    const effectiveFieldColors = getEffectiveDataAppVizFieldColorValues(
        fields,
        fieldMapping,
        fieldColorValues,
    );

    return (
        <Stack>
            {fields.length === 0 && (
                <Text c="dimmed" size="sm">
                    This chart type has no fields to map.
                </Text>
            )}

            {fields.map((field) => {
                const configOptions = field.configOptions ?? [];
                const declaredGradient = field.colorOptions?.gradient;
                const declaredRules = field.colorOptions?.rules;
                const guidanceId = field.description?.trim()
                    ? `${guidanceIdPrefix}-${field.name}`
                    : undefined;
                const items = fieldItems(field);
                const addItems = addPools[poolKeyForSlot(field)];
                const selectedValue = fieldMapping[field.name];
                const selectedIds = getDataAppVizFieldIds(selectedValue);
                const selectedItem =
                    typeof selectedValue === 'string'
                        ? (items.find((i) => getItemId(i) === selectedValue) ??
                          addItems.find((i) => getItemId(i) === selectedValue))
                        : undefined;
                const boundItems = [...items, ...addItems];
                return (
                    <Config key={field.name}>
                        <Config.Section>
                            {field.multiple ? (
                                <OrderedDataAppVizFieldSelect
                                    header={
                                        <Stack gap={2} flex={1}>
                                            <Group gap="xxs">
                                                <Config.Heading>
                                                    {field.label}
                                                </Config.Heading>
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
                                    addItems={addItems}
                                    selectedIds={selectedIds}
                                    describedBy={guidanceId}
                                    addDisabled={
                                        items.length === 0 &&
                                        addItems.length === 0
                                    }
                                    emptyPlaceholder={`You need at least one ${poolKeyForSlot(field)} in your chart to set this field`}
                                    isFieldPending={isFieldPending}
                                    onAddToQuery={addFieldToQuery}
                                    onChange={(ids) =>
                                        onFieldChange(field.name, ids)
                                    }
                                />
                            ) : (
                                <>
                                    <Group gap="xxs">
                                        <Config.Heading>
                                            {field.label}
                                        </Config.Heading>
                                        <DataAppVizFieldHelp field={field} />
                                    </Group>
                                    <DataAppVizFieldGuidance
                                        field={field}
                                        id={guidanceId}
                                    />
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
                                                newField
                                                    ? getItemId(newField)
                                                    : null,
                                            );
                                        }}
                                        clearable={!field.required}
                                        hasGrouping
                                    />
                                </>
                            )}
                            <DataAppVizFieldOptionControls
                                options={configOptions}
                                fieldIds={selectedIds}
                                items={boundItems}
                                values={effectiveFieldOptions[field.name] ?? {}}
                                colorPalette={colorPalette}
                                onChange={(fieldId, optionName, value) =>
                                    onFieldOptionChange(
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
                                    const boundItem = boundItems.find(
                                        (item) => getItemId(item) === fieldId,
                                    );
                                    if (!boundItem || !isNumericItem(boundItem))
                                        return null;
                                    return (
                                        <Stack key={fieldId} gap="xs" mt="sm">
                                            {configOptions.length === 0 && (
                                                <Text size="xs" fw={600}>
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
                                                    colorPalette={colorPalette}
                                                    onChange={(patch) =>
                                                        onFieldGradientChange(
                                                            field.name,
                                                            fieldId,
                                                            declaredGradient,
                                                            patch,
                                                        )
                                                    }
                                                />
                                            )}
                                            {declaredRules !== undefined && (
                                                <DataAppVizRulesControl
                                                    value={
                                                        effectiveFieldColors[
                                                            field.name
                                                        ]?.[fieldId]?.rules ??
                                                        declaredRules
                                                    }
                                                    colorPalette={colorPalette}
                                                    onChange={(update) =>
                                                        onFieldRulesChange(
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
                        </Config.Section>
                    </Config>
                );
            })}
        </Stack>
    );
};

export default DataAppVizSettings;
