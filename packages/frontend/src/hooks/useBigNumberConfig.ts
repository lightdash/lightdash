import {
    ApiQueryResults,
    BigNumber,
    Explore,
    findFieldByIdInExplore,
    friendlyName,
    getFieldLabel,
} from 'common';
import { useEffect, useState } from 'react';

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
    const [bigNumberLabel, setBigNumberLabel] = useState<string>('');
    const [bigNumberConfig, setBigNumberConfig] = useState<
        BigNumber | undefined
    >();

    useEffect(() => {
        if (resultsData) {
            setBigNumber(bigNumberValue);
        }

        if (fieldId) {
            const field = explore
                ? findFieldByIdInExplore(explore, fieldId)
                : undefined;
            const label = field ? getFieldLabel(field) : friendlyName(fieldId);
            setBigNumberLabel(label);
        }

        if (bigNumberConfigData) {
            setBigNumberConfig(bigNumberConfigData);
        }
    }, [resultsData]);

    return {
        bigNumber,
        setBigNumber,
        bigNumberLabel,
        setBigNumberLabel,
        bigNumberConfig,
        setBigNumberConfig,
    };
};

export default useBigNumberConfig;
