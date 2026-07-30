import { ComparisonFormatTypes, type VizColumn } from '@lightdash/common';
import { SegmentedControl, Stack, Switch, TextInput } from '@mantine-8/core';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import {
    setComparisonAggregation,
    setComparisonFormat,
    setComparisonLabel,
    setComparisonReference,
    setFlipColors,
    setShowComparison,
} from '../store/bigNumberSlice';
import { DataVizAggregationConfig } from './DataVizAggregationConfig';
import { useBigNumberFieldOptions } from './useBigNumberFieldOptions';

export const BigNumberComparisonConfig = ({
    columns,
}: {
    columns: VizColumn[];
}) => {
    const dispatch = useVizDispatch();
    const display = useVizSelector((state) => state.bigNumberConfig.display);
    const valueField = useVizSelector(
        (state) => state.bigNumberConfig.fieldConfig?.y[0],
    );
    const comparisonField = useVizSelector(
        (state) => state.bigNumberConfig.fieldConfig?.y[1],
    );
    const { selectData, fieldTypeOf, aggregationOptionsFor } =
        useBigNumberFieldOptions(columns);

    const showComparison = display?.showComparison ?? false;

    return (
        <Stack gap="sm" mb="lg">
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Compare to a field</Config.Heading>
                    <Switch
                        size="xs"
                        checked={showComparison}
                        onChange={(event) =>
                            dispatch(
                                setShowComparison(event.currentTarget.checked),
                            )
                        }
                    />
                </Config.Group>
            </Config.Section>

            {showComparison && (
                <>
                    <Config.Section>
                        <Config.Heading>Field</Config.Heading>

                        <FieldReferenceSelect
                            data={selectData.filter(
                                (option) =>
                                    option.value !== valueField?.reference,
                            )}
                            value={comparisonField?.reference}
                            placeholder="Select a field to compare against"
                            onChange={(value) =>
                                dispatch(
                                    setComparisonReference(value ?? undefined),
                                )
                            }
                            fieldType={fieldTypeOf(comparisonField?.reference)}
                        />

                        <Config.Group>
                            <Config.Label>Aggregation</Config.Label>

                            <DataVizAggregationConfig
                                options={aggregationOptionsFor(
                                    comparisonField?.reference,
                                )}
                                aggregation={comparisonField?.aggregation}
                                onChangeAggregation={(value) =>
                                    dispatch(setComparisonAggregation(value))
                                }
                            />
                        </Config.Group>
                    </Config.Section>

                    <Config.Section>
                        <Config.Label>Format</Config.Label>
                        <SegmentedControl
                            size="xs"
                            value={
                                display?.comparisonFormat ??
                                ComparisonFormatTypes.RAW
                            }
                            data={[
                                {
                                    value: ComparisonFormatTypes.RAW,
                                    label: 'Raw value',
                                },
                                {
                                    value: ComparisonFormatTypes.PERCENTAGE,
                                    label: 'Percentage',
                                },
                            ]}
                            onChange={(value) =>
                                dispatch(
                                    setComparisonFormat(
                                        value as ComparisonFormatTypes,
                                    ),
                                )
                            }
                        />
                    </Config.Section>

                    <Config.Section>
                        <Config.Group>
                            <Config.Label>Flip positive color</Config.Label>
                            <Switch
                                size="xs"
                                checked={display?.flipColors ?? false}
                                onChange={(event) =>
                                    dispatch(
                                        setFlipColors(
                                            event.currentTarget.checked,
                                        ),
                                    )
                                }
                            />
                        </Config.Group>
                    </Config.Section>

                    <Config.Section>
                        <Config.Label>Comparison label</Config.Label>
                        <TextInput
                            size="xs"
                            placeholder="Add an optional label"
                            value={display?.comparisonLabel ?? ''}
                            onChange={(event) =>
                                dispatch(
                                    setComparisonLabel(
                                        event.currentTarget.value || undefined,
                                    ),
                                )
                            }
                        />
                    </Config.Section>
                </>
            )}
        </Stack>
    );
};
