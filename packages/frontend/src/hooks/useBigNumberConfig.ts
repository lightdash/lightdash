import {
    ApiQueryResults,
    BigNumber,
    convertAdditionalMetric,
    Explore,
    fieldId,
    formatValue,
    friendlyName,
    getDimensions,
    getItemLabel,
    getItemMap,
    getMetrics,
    isField,
    isNumericItem,
    Metric,
    valueIsNaN,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
        if (!showLabel) setBigNumberLabel('');

        setBigNumberLabel(bigNumberConfigData?.label);
        setBigNumberStyle(bigNumberConfigData?.style);
    }, [bigNumberConfigData, showLabel]);

    // big number value (first row)
    const firstRowValueRaw =
        selectedField && resultsData?.rows?.[0]?.[selectedField]?.value.raw;

    // value for comparison (second row)
    const secondRowValueRaw =
        selectedField && resultsData?.rows?.[1]?.[selectedField]?.value.raw;

    const isFirstRowValueNumber =
        isNumericItem(item) &&
        !(firstRowValueRaw instanceof Date) &&
        !valueIsNaN(firstRowValueRaw);

    const isSecondRowValueNumber =
        !(secondRowValueRaw instanceof Date) && !valueIsNaN(secondRowValueRaw);

    const bigNumber = !isFirstRowValueNumber
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

    const formatValues = {
        RAW: 'raw',
        PERCENTAGE: 'percentage',
    };
    const [showComparison, setShowComparison] = useState<boolean>(false);
    const [comparisonFormat, setComparisonFormat] = useState<string>(
        formatValues.RAW,
    );

    const calculateComparisonValue = (a: number, b: number, format: string) => {
        const rawValue = Math.round(a - b);
        switch (format) {
            case formatValues.PERCENTAGE:
                return Math.round(((a - b) / b) * 100);

            case formatValues.RAW:
                return rawValue === 0 ? 'No change' : rawValue;
            default:
                return rawValue;
        }
    };

    const comparisonValue =
        firstRowValueRaw &&
        secondRowValueRaw &&
        isSecondRowValueNumber &&
        isFirstRowValueNumber
            ? calculateComparisonValue(
                  Number(firstRowValueRaw),
                  Number(secondRowValueRaw),
                  comparisonFormat,
              )
            : 'Comparison not applicable';

    const showStyle =
        isFirstRowValueNumber && (!isField(item) || item.format !== 'percent');

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
        formatValues,
        comparisonFormat,
        setComparisonFormat,
    };
};

export default useBigNumberConfig;
