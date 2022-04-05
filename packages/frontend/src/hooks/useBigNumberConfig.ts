import { ApiQueryResults } from 'common';
import { useState } from 'react';

const useBigNumberConfig = (
    //  bigNumberConfig: BigNumber | undefined,
    data: ApiQueryResults | undefined,
) => {
    const metric = data?.metricQuery.metrics[0];
    const bigNumberValue = metric && data?.rows?.[0][metric].value.formatted;

    const [bigNumber, setBigNumber] = useState<string | number>(bigNumberValue);
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
    };
};

export default useBigNumberConfig;
