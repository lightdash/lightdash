import {
    ApiQueryResults,
    BigNumber,
    CompactOrAlias,
    ComparisonDiffTypes,
    ComparisonFormatTypes,
    convertAdditionalMetric,
    Explore,
    Field,
    fieldId,
    Format,
    formatTableCalculationValue,
    formatValue,
    friendlyName,
    getDimensions,
    getItemLabel,
    getItemMap,
    getMetrics,
    isField,
    isNumericItem,
    isTableCalculation,
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

const NOT_APPLICABLE = 'n/a';
const UNDEFINED = 'undefined';
const formatComparisonValue = (
    format: ComparisonFormatTypes | undefined,
    comparisonDiff: ComparisonDiffTypes | undefined,
    item: Field | TableCalculation | undefined,
    value: number | string,
    bigNumberStyle: CompactOrAlias | undefined,
) => {
    const prefix =
        comparisonDiff === ComparisonDiffTypes.POSITIVE ||
        comparisonDiff === ComparisonDiffTypes.NONE
            ? '+'
            : '';
    if (value === UNDEFINED) {
        value = NOT_APPLICABLE;
    }
    switch (format) {
        case ComparisonFormatTypes.PERCENTAGE:
            return `${prefix}${formatValue(value, {
                format: Format.PERCENT,
                round: 0,
            })}`;
        case ComparisonFormatTypes.RAW:
            return `${prefix}${formatValue(value, {
                format: isField(item) ? item.format : undefined,
                round: bigNumberStyle
                    ? 2
                    : isField(item)
                    ? item.round
                    : undefined,
                compact: bigNumberStyle,
            })}`;
        default:
            return formatValue(value, {
                format: isField(item) ? item.format : undefined,
                round: bigNumberStyle
                    ? 2
                    : isField(item)
                    ? item.round
                    : undefined,
                compact: bigNumberStyle,
            });
    }
};

const isNumber = (i: Field | TableCalculation | undefined, value: any) =>
    isNumericItem(i) && !(value instanceof Date) && !valueIsNaN(value);

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
        (fieldNameOrId: string | undefined) => {
            if (fieldNameOrId === undefined) return;
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

    const itemMap = useMemo(() => {
        if (!explore) return;

        return getItemMap(
            explore,
            resultsData?.metricQuery.additionalMetrics,
            resultsData?.metricQuery.tableCalculations,
        );
    }, [explore, resultsData]);

    const item = useMemo(() => {
        if (!itemMap || !selectedField) return;

        return itemMap[selectedField];
    }, [itemMap, selectedField]);

    const label = useMemo(() => {
        return item
            ? getItemLabel(item)
            : selectedField && friendlyName(selectedField);
    }, [item, selectedField]);

    const [bigNumberLabel, setBigNumberLabel] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label);
    const [showBigNumberLabel, setShowBigNumberLabel] = useState<
        BigNumber['showBigNumberLabel'] | undefined
    >(bigNumberConfigData?.showBigNumberLabel);
    const [bigNumberStyle, setBigNumberStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style);

    const [showComparison, setShowComparison] = useState<
        BigNumber['showComparison'] | undefined
    >(bigNumberConfigData?.showComparison);
    const [comparisonFormat, setComparisonFormat] = useState<
        BigNumber['comparisonFormat'] | undefined
    >(bigNumberConfigData?.comparisonFormat);
    const [flipColors, setFlipColors] = useState<BigNumber['flipColors']>(
        bigNumberConfigData?.flipColors,
    );
    const [comparisonLabel, setComparisonLabel] = useState<
        BigNumber['comparisonLabel']
    >(bigNumberConfigData?.comparisonLabel);

    useEffect(() => {
        if (bigNumberConfigData?.selectedField !== undefined)
            setSelectedField(bigNumberConfigData.selectedField);

        setBigNumberLabel(bigNumberConfigData?.label);
        setShowBigNumberLabel(bigNumberConfigData?.showBigNumberLabel ?? true);

        setBigNumberStyle(bigNumberConfigData?.style);

        setShowComparison(bigNumberConfigData?.showComparison ?? false);
        setComparisonFormat(
            bigNumberConfigData?.comparisonFormat ?? ComparisonFormatTypes.RAW,
        );
        setFlipColors(bigNumberConfigData?.flipColors ?? false);
        setComparisonLabel(bigNumberConfigData?.comparisonLabel);
    }, [bigNumberConfigData]);

    // big number value (first row)
    const firstRowValueRaw = useMemo(() => {
        if (!selectedField || !resultsData) return;

        return resultsData.rows?.[0]?.[selectedField]?.value.raw;
    }, [selectedField, resultsData]);

    // value for comparison (second row)
    const secondRowValueRaw = useMemo(() => {
        if (!selectedField || !resultsData) return;
        return resultsData.rows?.[1]?.[selectedField]?.value.raw;
    }, [selectedField, resultsData]);

    const bigNumber = useMemo(() => {
        if (!isNumber(item, firstRowValueRaw)) {
            return (
                selectedField &&
                resultsData?.rows?.[0]?.[selectedField]?.value.formatted
            );
        } else if (item !== undefined && isTableCalculation(item)) {
            return formatTableCalculationValue(item, firstRowValueRaw);
        } else {
            return formatValue(firstRowValueRaw, {
                format: isField(item) ? item.format : undefined,
                round: bigNumberStyle
                    ? 2
                    : isField(item)
                    ? item.round
                    : undefined,
                compact: bigNumberStyle,
            });
        }
    }, [item, firstRowValueRaw, selectedField, bigNumberStyle, resultsData]);

    const unformattedValue = useMemo(() => {
        return isNumber(item, secondRowValueRaw) &&
            isNumber(item, firstRowValueRaw)
            ? calculateComparisonValue(
                  Number(firstRowValueRaw),
                  Number(secondRowValueRaw),
                  comparisonFormat,
              )
            : secondRowValueRaw === undefined
            ? UNDEFINED
            : NOT_APPLICABLE;
    }, [item, secondRowValueRaw, firstRowValueRaw, comparisonFormat]);

    const comparisonDiff = useMemo(() => {
        return unformattedValue === UNDEFINED
            ? ComparisonDiffTypes.UNDEFINED
            : unformattedValue === NOT_APPLICABLE
            ? ComparisonDiffTypes.NAN
            : unformattedValue > 0
            ? ComparisonDiffTypes.POSITIVE
            : unformattedValue < 0
            ? ComparisonDiffTypes.NEGATIVE
            : unformattedValue === 0
            ? ComparisonDiffTypes.NONE
            : ComparisonDiffTypes.NAN;
    }, [unformattedValue]);

    const comparisonValue = useMemo(() => {
        return unformattedValue === NOT_APPLICABLE
            ? NOT_APPLICABLE
            : formatComparisonValue(
                  comparisonFormat,
                  comparisonDiff,
                  item,
                  unformattedValue,
                  bigNumberStyle,
              );
    }, [
        comparisonFormat,
        comparisonDiff,
        item,
        unformattedValue,
        bigNumberStyle,
    ]);

    const comparisonTooltip = useMemo(() => {
        switch (comparisonDiff) {
            case ComparisonDiffTypes.POSITIVE:
            case ComparisonDiffTypes.NEGATIVE:
                return `${comparisonValue} compared to previous row`;
            case ComparisonDiffTypes.NONE:
                return `No change compared to previous row`;
            case ComparisonDiffTypes.NAN:
                return `The previous row's value is not a number`;
            case ComparisonDiffTypes.UNDEFINED:
                return `There is no previous row to compare to`;
        }
    }, [comparisonValue, comparisonDiff]);

    const showStyle =
        isNumber(item, firstRowValueRaw) &&
        item !== undefined &&
        !isTableCalculation(item) &&
        (!isField(item) || item.format !== 'percent');

    const validConfig: BigNumber = useMemo(() => {
        return {
            label: bigNumberLabel,
            style: bigNumberStyle,
            selectedField: selectedField,
            showBigNumberLabel,
            showComparison,
            comparisonFormat,
            flipColors,
            comparisonLabel,
        };
    }, [
        bigNumberLabel,
        bigNumberStyle,
        selectedField,
        showBigNumberLabel,
        showComparison,
        comparisonFormat,
        flipColors,
        comparisonLabel,
    ]);

    return {
        bigNumber,
        bigNumberLabel,
        defaultLabel: label,
        setBigNumberLabel,
        validConfig,
        bigNumberStyle,
        setBigNumberStyle,
        showStyle,
        availableFields,
        selectedField,
        setSelectedField,
        getField,
        comparisonValue,
        showBigNumberLabel,
        setShowBigNumberLabel,
        showComparison,
        setShowComparison,
        comparisonFormat,
        setComparisonFormat,
        comparisonDiff,
        flipColors,
        setFlipColors,
        comparisonTooltip,
        comparisonLabel,
        setComparisonLabel,
    };
};

export default useBigNumberConfig;
