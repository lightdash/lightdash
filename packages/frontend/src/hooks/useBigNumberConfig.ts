import {
    ApiQueryResults,
    BigNumber,
    ComparisonDiffTypes,
    ComparisonFormatTypes,
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

const calculateComparisonValue = (
    a: number,
    b: number,
    format: ComparisonFormatTypes | undefined,
) => {
    const rawValue = a - b;
    switch (format) {
        case ComparisonFormatTypes.PERCENTAGE:
            return rawValue / b;
        case ComparisonFormatTypes.RAW:
            return rawValue;
        default:
            return rawValue;
    }
};

const formatComparisonValue = (
    format: ComparisonFormatTypes | undefined,
    comparisonDiff: ComparisonDiffTypes | undefined,
    item: Field | TableCalculation | undefined,
    value: number | string,
) => {
    const prefix =
        comparisonDiff ===
        (ComparisonDiffTypes.POSITIVE || ComparisonDiffTypes.NONE)
            ? '+'
            : '';
    switch (format) {
        case ComparisonFormatTypes.PERCENTAGE:
            return `${prefix}${formatValue(value, {
                format: 'percent',
                round: 0,
            })}`;
        case ComparisonFormatTypes.RAW:
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
    const [showLabel, setShowLabel] = useState<
        BigNumber['showLabel'] | undefined
    >(bigNumberConfigData?.showLabel);
    const [bigNumberStyle, setBigNumberStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style);

    const [showComparison, setShowComparison] = useState<
        BigNumber['showComparison'] | undefined
    >(bigNumberConfigData?.showComparison);
    const [comparisonFormat, setComparisonFormat] = useState<
        BigNumber['comparisonFormat'] | undefined
    >(bigNumberConfigData?.comparisonFormat);

    useEffect(() => {
        if (bigNumberConfigData?.selectedField !== undefined)
            setSelectedField(bigNumberConfigData.selectedField);

        setBigNumberLabel(bigNumberConfigData?.label);
        setShowLabel(bigNumberConfigData?.showLabel);

        setBigNumberStyle(bigNumberConfigData?.style);

        setShowComparison(bigNumberConfigData?.showComparison);
        setComparisonFormat(bigNumberConfigData?.comparisonFormat);
    }, [bigNumberConfigData]);

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

    const unformattedValue =
        isNumber(item, secondRowValueRaw) && isNumber(item, firstRowValueRaw)
            ? calculateComparisonValue(
                  Number(firstRowValueRaw),
                  Number(secondRowValueRaw),
                  comparisonFormat,
              )
            : 'N/A';

    const comparisonDiff = useMemo(() => {
        return unformattedValue > 0
            ? ComparisonDiffTypes.POSITIVE
            : unformattedValue < 0
            ? ComparisonDiffTypes.NEGATIVE
            : unformattedValue === 0
            ? ComparisonDiffTypes.NONE
            : valueIsNaN(unformattedValue)
            ? ComparisonDiffTypes.NAN
            : ComparisonDiffTypes.UNDEFINED;
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

    const validBigNumberConfig: BigNumber = useMemo(() => {
        return {
            label: bigNumberLabel,
            style: bigNumberStyle,
            selectedField: selectedField,
            showLabel,
            showComparison,
            comparisonFormat,
        };
    }, [
        bigNumberLabel,
        bigNumberStyle,
        selectedField,
        showLabel,
        showComparison,
        comparisonFormat,
    ]);
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
        comparisonFormatTypes: ComparisonFormatTypes,
        comparisonFormat,
        setComparisonFormat,
        comparisonDiff,
        comparisonDiffTypes: ComparisonDiffTypes,
    };
};

export default useBigNumberConfig;
