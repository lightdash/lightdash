import {
    ApiQueryResults,
    Explore,
    findFieldByIdInExplore,
    friendlyName,
    getFieldLabel,
} from 'common';
import { useEffect, useState } from 'react';

const useBigNumberConfig = (
    //  bigNumberConfig: BigNumber | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
) => {
    const metric = resultsData?.metricQuery.metrics[0];
    const bigNumberValue =
        metric && resultsData?.rows?.[0][metric].value.formatted;

    const fieldId = resultsData?.metricQuery.metrics[0];

    const [bigNumber, setBigNumber] = useState<string | number>('');
    const [bigNumberLabel, setBigNumberLabel] = useState<string>('');

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
    }, [resultsData]);

    // const [bigNumberConfigLabel, setBigNumberConfigLabel] =
    //     (useState < BigNumber?.label) | (undefined > bigNumberConfig);

    // const [dirtyLayout, setDirtyLayout] = useState<BigNumber>(
    //     bigNumberConfig?.label,
    // );

    // useEffect(() => {
    //     setBigNumberConfigLabel(bigNumberConfig);
    // }, [bigNumber]);

    // const setBigNumberLabel = useCallback((label: string | undefined) => {
    //     setDirtyLayout((prev) => ({
    //         ...prev,
    //         label,
    //     }));
    // }, []);

    // const updateYField = useCallback((label: string) => {
    //     setDirtyLayout((prev) => ({
    //         ...prev,
    //         label: prev?.label || label,
    //     }));
    // }, []);

    return {
        // bigNumberConfig,
        // setBigNumberConfigLabel,
        bigNumber,
        setBigNumber,
        bigNumberLabel,
        setBigNumberLabel,
    };
};

export default useBigNumberConfig;
