import { ComparisonFormatTypes, type VizColumn } from '@lightdash/common';
import { SegmentedControl, Stack, Switch, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('dataViz');
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
                    <Config.Heading>
                        {t('bigNumber.comparison.compareToField')}
                    </Config.Heading>
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
                        <Config.Heading>
                            {t('bigNumber.comparison.field')}
                        </Config.Heading>

                        <FieldReferenceSelect
                            data={selectData.filter(
                                (option) =>
                                    option.value !== valueField?.reference,
                            )}
                            value={comparisonField?.reference}
                            placeholder={t(
                                'bigNumber.comparison.selectFieldPlaceholder',
                            )}
                            onChange={(value) =>
                                dispatch(
                                    setComparisonReference(value ?? undefined),
                                )
                            }
                            fieldType={fieldTypeOf(comparisonField?.reference)}
                        />

                        <Config.Group>
                            <Config.Label>
                                {t('common.aggregation')}
                            </Config.Label>

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
                        <Config.Label>{t('bigNumber.format')}</Config.Label>
                        <SegmentedControl
                            size="xs"
                            value={
                                display?.comparisonFormat ??
                                ComparisonFormatTypes.RAW
                            }
                            data={[
                                {
                                    value: ComparisonFormatTypes.RAW,
                                    label: t('bigNumber.comparison.rawValue'),
                                },
                                {
                                    value: ComparisonFormatTypes.PERCENTAGE,
                                    label: t('bigNumber.comparison.percentage'),
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
                            <Config.Label>
                                {t('bigNumber.comparison.flipColors')}
                            </Config.Label>
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
                        <Config.Label>
                            {t('bigNumber.comparison.label')}
                        </Config.Label>
                        <TextInput
                            size="xs"
                            placeholder={t(
                                'bigNumber.comparison.labelPlaceholder',
                            )}
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
