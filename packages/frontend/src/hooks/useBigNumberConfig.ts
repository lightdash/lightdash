import {
    ApiQueryResults,
    BigNumber,
    Explore,
    findFieldByIdInExplore,
    formatValue,
    friendlyName,
    getFieldLabel,
    NumberStyle,
} from 'common';
import { useCallback, useEffect, useMemo, useState } from 'react';

const useBigNumberConfig = (
    bigNumberConfigData: BigNumber | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
) => {
    const featuredData =
        resultsData?.metricQuery.metrics[0] ||
        resultsData?.metricQuery.dimensions[0] ||
        resultsData?.metricQuery.tableCalculations[0]?.name;

    const fieldId =
        resultsData?.metricQuery.metrics[0] ||
        resultsData?.metricQuery.dimensions[0] ||
        resultsData?.metricQuery.tableCalculations[0]?.name;

    const field =
        explore && fieldId
            ? findFieldByIdInExplore(explore, fieldId)
            : undefined;
    const label = field
        ? getFieldLabel(field)
        : fieldId && friendlyName(fieldId);

    const [bigNumberLabel, setBigNumberName] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label || label);

    const [bigNumberStyle, setStateBigNumberStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style || undefined);
    useEffect(() => {
        setBigNumberName(bigNumberConfigData?.label || label);
        setStateBigNumberStyle(bigNumberConfigData?.style || undefined);
    }, [
        resultsData,
        bigNumberConfigData?.label,
        label,
        bigNumberConfigData?.style,
    ]);

    const setBigNumberLabel = useCallback((name: string | undefined) => {
        setBigNumberName((prev) => name || prev);
    }, []);

    const setBigNumberStyle = useCallback((style: NumberStyle | undefined) => {
        setStateBigNumberStyle(style);
    }, []);

    const bigNumberRaw =
        featuredData && resultsData?.rows?.[0]?.[featuredData]?.value.raw;

    const bigNumber = formatValue(
        field?.format,
        field?.round,
        bigNumberRaw,
        bigNumberStyle,
    );

    const isNaN =
        (bigNumberRaw?.includes && bigNumberRaw.includes('Z')) ||
        Number.isNaN(Number(bigNumberRaw));

    const showStyle = !isNaN && field?.format !== 'percent';

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
        setBigNumberLabel,
        validBigNumberConfig,
        bigNumberStyle,
        setBigNumberStyle,
        showStyle,
    };
};

export default useBigNumberConfig;
