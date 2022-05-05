import {
    ApiQueryResults,
    BigNumber,
    Explore,
    findFieldByIdInExplore,
    friendlyName,
    getFieldLabel,
} from 'common';
import { useCallback, useEffect, useMemo, useState } from 'react';

const useBigNumberConfig = (
    bigNumberConfigData: BigNumber | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
) => {
    const featuredData =
        resultsData?.metricQuery.metrics[0] ||
        resultsData?.metricQuery.dimensions[0];

    const bigNumber =
        featuredData && resultsData?.rows?.[0]?.[featuredData]?.value.raw;
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

    const [bigNumberLabel, setBigNumberName] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label || label);

    const [bigNumberStyle, setBigNumberStyle] = useState<string>('none');

    useEffect(() => {
        setBigNumberName(bigNumberConfigData?.label || label);
    }, [resultsData, bigNumberConfigData?.label, label]);

    const setBigNumberLabel = useCallback((name: string | undefined) => {
        setBigNumberName((prev) => name || prev);
    }, []);
    /*
    const setBigNumberStyle = useCallback((name: string | undefined) => {
        setBigNumberName((prev) => name || prev);
    }, []);;*/

    const validBigNumberConfig: BigNumber | undefined = useMemo(
        () =>
            bigNumberLabel
                ? {
                      label: bigNumberLabel,
                  }
                : undefined,
        [bigNumberLabel],
    );

    return {
        bigNumber,
        bigNumberLabel,
        setBigNumberLabel,
        validBigNumberConfig,
        bigNumberStyle,
        setBigNumberStyle,
        field,
    };
};

export default useBigNumberConfig;
