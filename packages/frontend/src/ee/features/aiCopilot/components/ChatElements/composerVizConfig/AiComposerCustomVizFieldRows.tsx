import {
    DimensionType,
    getComposerCustomVizPool,
    getDataAppVizFieldIds,
    getEffectiveOptionValues,
    type ComposerCustomVizConfig,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type ResultColumn,
    type SourceQuery,
} from '@lightdash/common';
import { Fieldset, Loader, MultiSelect, Stack, Text } from '@mantine/core';
import omit from 'lodash/omit';
import { type FC } from 'react';
import { FieldReferenceSelect } from '../../../../../../components/DataViz/FieldReferenceSelect';
import DataAppVizOptionControl from '../../../../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizOptionControl';
import { useComposerChartColors } from '../useComposerChartColors';
import { useComposerCustomViz } from '../useComposerCustomViz';
import styles from './AiComposerVizConfigPanel.module.css';
import { AiComposerVizFieldRow } from './AiComposerVizFieldRows';

type Props = {
    projectUuid: string;
    value: ComposerCustomVizConfig;
    columns: ResultColumn[];
    node: SourceQuery | null;
    onChange: (value: ComposerCustomVizConfig) => void;
    disabled: boolean;
};

const withBinding = (
    mapping: DataAppVizFieldMapping,
    field: DataAppVizField,
    ids: string[],
): DataAppVizFieldMapping => {
    if (field.multiple) return { ...mapping, [field.name]: ids };
    return ids[0]
        ? { ...mapping, [field.name]: ids[0] }
        : omit(mapping, field.name);
};

/** One row per slot of the custom chart type, then its config options; controlled on the stored viz config. */
export const AiComposerCustomVizFieldRows: FC<Props> = ({
    projectUuid,
    value,
    columns,
    node,
    onChange,
    disabled,
}) => {
    const colorPalette = useComposerChartColors(projectUuid);
    const { metadata, schema, pools, fieldMapping } = useComposerCustomViz({
        projectUuid,
        vizConfig: value,
        columns,
        node,
    });

    if (!schema || !fieldMapping) {
        return metadata.isInitialLoading ? (
            <Loader size="xs" />
        ) : (
            <Text size="xs" c="dimmed">
                This custom chart type&apos;s settings could not be loaded.
            </Text>
        );
    }

    const byReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const toData = (references: string[]) =>
        references.map((reference) => ({
            value: reference,
            label: byReference.get(reference)?.label ?? reference,
        }));
    const typeOf = (reference: string | undefined) =>
        (reference && byReference.get(reference)?.type) || DimensionType.STRING;
    const bind = (field: DataAppVizField, ids: string[]) =>
        onChange({
            ...value,
            fieldMapping: withBinding(fieldMapping, field, ids),
        });
    const optionValues = getEffectiveOptionValues(
        schema.configOptions,
        value.optionValues,
    );

    return (
        <Fieldset variant="unstyled" disabled={disabled}>
            <Stack gap="md">
                {schema.fields.map((field) => {
                    const data = toData(
                        getComposerCustomVizPool(pools, field.type),
                    );
                    const ids = getDataAppVizFieldIds(fieldMapping[field.name]);
                    return (
                        <AiComposerVizFieldRow
                            key={field.name}
                            title={field.label}
                        >
                            {field.multiple ? (
                                <MultiSelect
                                    aria-label={field.label}
                                    placeholder={
                                        ids.length === 0
                                            ? 'Select columns'
                                            : undefined
                                    }
                                    disabled={disabled}
                                    comboboxProps={{ withinPortal: true }}
                                    data={data}
                                    value={ids}
                                    onChange={(next) => bind(field, next)}
                                />
                            ) : (
                                <FieldReferenceSelect
                                    aria-label={field.label}
                                    placeholder="Select a column"
                                    clearable={!field.required}
                                    allowDeselect={!field.required}
                                    disabled={disabled}
                                    comboboxProps={{ withinPortal: true }}
                                    data={data}
                                    value={ids[0] ?? null}
                                    onChange={(reference) =>
                                        bind(
                                            field,
                                            reference ? [reference] : [],
                                        )
                                    }
                                    fieldType={typeOf(ids[0])}
                                    className={
                                        ids[0] ? undefined : styles.emptySelect
                                    }
                                />
                            )}
                        </AiComposerVizFieldRow>
                    );
                })}
                {schema.configOptions.map((option) => (
                    <DataAppVizOptionControl
                        key={option.name}
                        option={option}
                        value={optionValues[option.name]}
                        colorPalette={colorPalette}
                        onChange={(next) =>
                            onChange({
                                ...value,
                                optionValues: {
                                    ...value.optionValues,
                                    [option.name]: next,
                                },
                            })
                        }
                    />
                ))}
            </Stack>
        </Fieldset>
    );
};
