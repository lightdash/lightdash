import { DimensionType, type VizColumn } from '@lightdash/common';
import { useMemo } from 'react';
import { useAppSelector as useVizSelector } from '../../../features/sqlRunner/store/hooks';

/**
 * The value and comparison pickers offer the same fields and share the way a
 * field's type and aggregation options are resolved.
 */
export const useBigNumberFieldOptions = (columns: VizColumn[]) => {
    const metricFieldOptions = useVizSelector(
        (state) => state.bigNumberConfig.options.metricFieldOptions,
    );
    const customMetricFieldOptions = useVizSelector(
        (state) => state.bigNumberConfig.options.customMetricFieldOptions,
    );

    const fieldOptions = useMemo(
        () => [...metricFieldOptions, ...customMetricFieldOptions],
        [metricFieldOptions, customMetricFieldOptions],
    );

    const selectData = useMemo(
        () =>
            fieldOptions.map((option) => ({
                value: option.reference,
                label: option.reference,
            })),
        [fieldOptions],
    );

    const fieldTypeOf = (reference: string | undefined) =>
        columns?.find((column) => column.reference === reference)?.type ??
        DimensionType.NUMBER;

    const aggregationOptionsFor = (reference: string | undefined) =>
        customMetricFieldOptions.find(
            (option) => option.reference === reference,
        )?.aggregationOptions;

    return { fieldOptions, selectData, fieldTypeOf, aggregationOptionsFor };
};
