import {
    ApiQueryResults,
    BigNumber,
    DimensionType,
    Explore,
    findFieldByIdInExplore,
    formatValue,
    friendlyName,
    getFieldLabel,
    MetricType,
} from 'common';
import { useEffect, useMemo, useState } from 'react';

const useBigNumberConfig = (
    bigNumberConfigData: BigNumber | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
) => {
    const fieldId =
        resultsData?.metricQuery.metrics[0] ||
        resultsData?.metricQuery.dimensions[0];
    const field =
        explore && fieldId
            ? findFieldByIdInExplore(explore, fieldId)
            : undefined;
    const label = field
        ? getFieldLabel(field)
        : fieldId && friendlyName(fieldId);

    const [bigNumberLabel, setBigNumberLabel] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label);

    const [bigNumberStyle, setBigNumberStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style);

    useEffect(() => {
        setBigNumberLabel(bigNumberConfigData?.label);
    }, [resultsData, bigNumberConfigData?.label]);

    const bigNumberRaw =
        fieldId && resultsData?.rows?.[0]?.[fieldId]?.value.raw;

    const isNumber =
        field &&
        (
            [
                DimensionType.NUMBER,
                MetricType.NUMBER,
                MetricType.AVERAGE,
                MetricType.COUNT,
                MetricType.COUNT_DISTINCT,
                MetricType.SUM,
                MetricType.MIN,
                MetricType.MAX,
            ] as string[]
        ).includes(field.type);

    const bigNumber = !isNumber
        ? fieldId && resultsData?.rows?.[0]?.[fieldId]?.value.formatted
        : formatValue(
              field?.format,
              field?.round,
              bigNumberRaw,
              bigNumberStyle,
          );

    const showStyle = isNumber && field?.format !== 'percent';

    const validBigNumberConfig: BigNumber | undefined = useMemo(
        () =>
            bigNumberLabel
                ? {
                      label: bigNumberLabel,
                      style: bigNumberStyle,
                  }
                : undefined,
        [bigNumberLabel, bigNumberStyle],
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
    };
};

export default useBigNumberConfig;
