import {
    ApiQueryResults,
    BigNumber,
    Explore,
    findFieldByIdInExplore,
    friendlyName,
    getFieldLabel,
} from 'common';
import { useCallback, useEffect, useState } from 'react';

const useBigNumberConfig = (
    bigNumberConfigData: BigNumber | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
) => {
    const metric = resultsData?.metricQuery.metrics[0];
    const bigNumberValue =
        metric && resultsData?.rows?.[0][metric].value.formatted;

    const fieldId = resultsData?.metricQuery.metrics[0];

    const [bigNumber, setBigNumber] = useState<string | number>('');
    const [bigNumberLabel, setBigNumberName] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label);

    useEffect(() => {
        if (resultsData) {
            setBigNumber(bigNumberValue);
        }

        if (fieldId) {
            const field = explore
                ? findFieldByIdInExplore(explore, fieldId)
                : undefined;
            const label = field ? getFieldLabel(field) : friendlyName(fieldId);
            setBigNumberName(label);
        }
    }, [resultsData]);

    const setBigNumberLabel = useCallback((name: string | undefined) => {
        setBigNumberName((prev) => name || prev);
    }, []);

    return {
        bigNumber,
        setBigNumber,
        bigNumberLabel,
        setBigNumberLabel,
    };
};

export default useBigNumberConfig;
