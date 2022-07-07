import {
    ApiQueryResults,
    BigNumber,
    convertAdditionalMetric,
    Explore,
    fieldId,
    findFieldByIdInExplore,
    formatValue,
    friendlyName,
    getDimensions,
    getFieldLabel,
    getMetrics,
    isField,
    isNumericItem,
    Metric,
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

    const [selectedField, setSelectedField] = useState<string | undefined>(
        bigNumberConfigData?.selectedField,
    );

    const getField = useCallback(
        (field: string) => {
            return availableFields.find(
                (f) => (isField(f) && fieldId(f) === field) || f.name === field,
            );
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

            if (selectedField === undefined || !selectedFieldExists) {
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

    const field =
        explore && selectedField
            ? findFieldByIdInExplore(explore, selectedField)
            : undefined;
    const label = field
        ? getFieldLabel(field)
        : selectedField && friendlyName(selectedField);

    const [bigNumberLabel, setBigNumberLabel] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label);

    const [bigNumberStyle, setBigNumberStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style);

    useEffect(() => {
        setSelectedField(bigNumberConfigData?.selectedField);

        setBigNumberLabel(bigNumberConfigData?.label);
        setBigNumberStyle(bigNumberConfigData?.style);
    }, [bigNumberConfigData]);

    const bigNumberRaw =
        selectedField && resultsData?.rows?.[0]?.[selectedField]?.value.raw;

    const isNumber = isNumericItem(field) && !(bigNumberRaw instanceof Date);

    const bigNumber = !isNumber
        ? selectedField &&
          resultsData?.rows?.[0]?.[selectedField]?.value.formatted
        : formatValue(
              field?.format,
              bigNumberStyle ? 2 : field?.round,
              bigNumberRaw,
              bigNumberStyle,
          );

    const showStyle = isNumber && field?.format !== 'percent';

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
    };
};

export default useBigNumberConfig;
