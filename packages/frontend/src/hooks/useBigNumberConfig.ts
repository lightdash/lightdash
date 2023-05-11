import {
    ApiQueryResults,
    BigNumber,
    convertAdditionalMetric,
    Explore,
    Field,
    fieldId,
    formatItemValue,
    formatValue,
    friendlyName,
    getDimensions,
    getItemLabel,
    getItemMap,
    getMetrics,
    isField,
    isNumericItem,
    Metric,
    TableCalculation,
    valueIsNaN,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

enum comparisonFormatTypes {
    RAW = 'raw',
    PERCENTAGE = 'percentage',
}

enum comparisonDiffTypes {
    POSITIVE = 'positive',
    NEGATIVE = 'negative',
    NONE = 'none',
    NAN = 'nan',
}

const calculateComparisonValue = (
    a: number,
    b: number,
    format: comparisonFormatTypes,
) => {
    const rawValue = a - b;
    switch (format) {
        case comparisonFormatTypes.PERCENTAGE:
            return rawValue / b;
        case comparisonFormatTypes.RAW:
            return rawValue;
        default:
            return rawValue;
    }
};

const formatComparisonValue = (
    format: comparisonFormatTypes,
    comparisonDiff: comparisonDiffTypes | undefined,
    item: Field | TableCalculation | undefined,
    value: number | string,
) => {
    const prefix =
        comparisonDiff === comparisonDiffTypes.NAN ||
        comparisonDiffTypes.NEGATIVE
            ? ''
            : comparisonDiff === comparisonDiffTypes.POSITIVE ||
              comparisonDiffTypes.NONE
            ? '+'
            : '';
    switch (format) {
        case comparisonFormatTypes.PERCENTAGE:
            return `${prefix}${formatValue(value, {
                format: 'percent',
                round: 0,
            })}`;
        case comparisonFormatTypes.RAW:
            return `${prefix}${formatItemValue(item, value)}`;
        default:
            return formatItemValue(item, value);
    }
};

const useBigNumberConfig = (
    bigNumberConfigData: BigNumber | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
) => {
    const [availableFields, availableFieldsIds] = useMemo(() => {
        const customMetrics = explore
            ? (resultsData?.metricQuery.additionalMetrics || []).reduce<
                  Metric[]
              >((acc, additionalMetric) => {
                  const table = explore.tables[additionalMetric.table];
                  if (table) {
                      const metric = convertAdditionalMetric({
                          additionalMetric,
                          table,
                      });
                      return [...acc, metric];
                  }
                  return acc;
              }, [])
            : [];
        const tableCalculations = resultsData?.metricQuery.tableCalculations
            ? resultsData?.metricQuery.tableCalculations
            : [];
        const dimensions = explore
            ? getDimensions(explore).filter((field) =>
                  resultsData?.metricQuery.dimensions.includes(fieldId(field)),
              )
            : [];
        const metrics = explore
            ? getMetrics(explore).filter((field) =>
                  resultsData?.metricQuery.metrics.includes(fieldId(field)),
              )
            : [];

        const fields = [
            ...metrics,
            ...customMetrics,
            ...dimensions,
            ...tableCalculations,
        ];
        const fieldIds = fields.map((field) =>
            isField(field) ? fieldId(field) : field.name,
        );
        return [fields, fieldIds];
    }, [resultsData, explore]);

    const [selectedField, setSelectedField] = useState<string | undefined>();
    const getField = useCallback(
        (fieldNameOrId: string) => {
            return availableFields.find((f) => {
                return isField(f)
                    ? fieldId(f) === fieldNameOrId
                    : f.name === fieldNameOrId;
            });
        },
        [availableFields],
    );

    useEffect(() => {
        if (explore && availableFieldsIds.length > 0 && bigNumberConfigData) {
            const selectedFieldExists =
                bigNumberConfigData?.selectedField &&
                getField(bigNumberConfigData?.selectedField) !== undefined;
            const defaultSelectedField = selectedFieldExists
                ? bigNumberConfigData?.selectedField
                : availableFieldsIds[0];

            if (selectedField === undefined || selectedFieldExists === false) {
                // Set default selectedField on explore load
                // or if existing selectedField is no longer available, default to first available field
                setSelectedField(defaultSelectedField);
            }
        }
    }, [
        explore,
        bigNumberConfigData,
        selectedField,
        availableFieldsIds,
        getField,
    ]);

    const item =
        explore && selectedField
            ? getItemMap(
                  explore,
                  resultsData?.metricQuery.additionalMetrics,
                  resultsData?.metricQuery.tableCalculations,
              )[selectedField]
            : undefined;
    const label = item
        ? getItemLabel(item)
        : selectedField && friendlyName(selectedField);

    const [bigNumberLabel, setBigNumberLabel] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label);
    const [showLabel, setShowLabel] = useState<boolean>(true);

    const [bigNumberStyle, setBigNumberStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style);

    useEffect(() => {
        if (bigNumberConfigData?.selectedField !== undefined)
            setSelectedField(bigNumberConfigData.selectedField);

        setBigNumberLabel(bigNumberConfigData?.label);
        setBigNumberStyle(bigNumberConfigData?.style);
    }, [bigNumberConfigData, showLabel]);

    // big number value (first row)
    const firstRowValueRaw =
        selectedField && resultsData?.rows?.[0]?.[selectedField]?.value.raw;

    // value for comparison (second row)
    const secondRowValueRaw =
        selectedField && resultsData?.rows?.[1]?.[selectedField]?.value.raw;
    const isNumber = (i: Field | TableCalculation | undefined, value: any) =>
        isNumericItem(i) && !(value instanceof Date) && !valueIsNaN(value);

    const bigNumber = !isNumber(item, firstRowValueRaw)
        ? selectedField &&
          resultsData?.rows?.[0]?.[selectedField]?.value.formatted
        : formatValue(firstRowValueRaw, {
              format: isField(item) ? item.format : undefined,
              round: bigNumberStyle
                  ? 2
                  : isField(item)
                  ? item.round
                  : undefined,
              compact: bigNumberStyle,
          });

    const [showComparison, setShowComparison] = useState<boolean>(false);
    const [comparisonFormat, setComparisonFormat] =
        useState<comparisonFormatTypes>(comparisonFormatTypes.RAW);
    const [comparisonDiff, setComparisonDiff] = useState<
        comparisonDiffTypes | undefined
    >(undefined);

    const unformattedValue =
        isNumber(item, secondRowValueRaw) && isNumber(item, firstRowValueRaw)
            ? calculateComparisonValue(
                  Number(firstRowValueRaw),
                  Number(secondRowValueRaw),
                  comparisonFormat,
              )
            : 'N/A';

    useEffect(() => {
        setComparisonDiff(
            unformattedValue > 0
                ? comparisonDiffTypes.POSITIVE
                : unformattedValue < 0
                ? comparisonDiffTypes.NEGATIVE
                : unformattedValue === 0
                ? comparisonDiffTypes.NONE
                : valueIsNaN(unformattedValue)
                ? comparisonDiffTypes.NAN
                : undefined,
        );
    }, [unformattedValue]);

    const comparisonValue = formatComparisonValue(
        comparisonFormat,
        comparisonDiff,
        item,
        unformattedValue,
    );

    const showStyle =
        isNumber(item, firstRowValueRaw) &&
        (!isField(item) || item.format !== 'percent');

    const validBigNumberConfig: BigNumber = useMemo(
        () => ({
            label: bigNumberLabel,
            style: bigNumberStyle,
            selectedField: selectedField,
        }),
        [bigNumberLabel, bigNumberStyle, selectedField],
    );
    return {
        bigNumber,
        bigNumberLabel,
        defaultLabel: label,
        setBigNumberLabel,
        validBigNumberConfig,
        bigNumberStyle,
        setBigNumberStyle,
        showStyle,
        availableFields,
        selectedField,
        setSelectedField,
        getField,
        comparisonValue,
        showLabel,
        setShowLabel,
        showComparison,
        setShowComparison,
        comparisonFormatTypes,
        comparisonFormat,
        setComparisonFormat,
        comparisonDiff,
        comparisonDiffTypes,
    };
};

export default useBigNumberConfig;
