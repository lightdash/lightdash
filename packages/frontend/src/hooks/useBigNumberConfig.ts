import {
    ApiQueryResults,
    findFieldByIdInExplore,
    friendlyName,
    getFieldLabel,
} from 'common';
import { useState, useEffect } from 'react';
import { useVisualizationContext } from '../components/LightdashVisualization/VisualizationProvider';

const useBigNumberConfig = (
    //  bigNumberConfig: BigNumber | undefined,
) => {
    const { resultsData, explore } = useVisualizationContext();

    const metric = resultsData?.metricQuery.metrics[0];
    const bigNumberValue =
        metric && resultsData?.rows?.[0][metric].value.formatted;

    const fieldId = resultsData?.metricQuery.metrics[0];

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

    const [bigNumber, setBigNumber] = useState<string | number>('');
    const [bigNumberLabel, setBigNumberLabel] = useState<string>('');

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
