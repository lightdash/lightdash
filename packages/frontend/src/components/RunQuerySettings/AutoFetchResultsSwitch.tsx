import { Switch, Tooltip, type MantineSize } from '@mantine-8/core';
import { memo, type FC } from 'react';
import { useAutoFetch } from '../../hooks/useAutoFetch';

const AutoFetchResultsSwitch: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [autoFetchEnabled, setAutoFetchEnabled] = useAutoFetch();

    return (
        <Tooltip
            label="Automatically re-run query on change (e.g. add fields, change sort)"
            position="bottom"
            refProp="rootRef"
            withArrow
            withinPortal
        >
            <Switch
                size={size}
                label="Auto-fetch results"
                checked={autoFetchEnabled}
                onChange={() => setAutoFetchEnabled(!autoFetchEnabled)}
                // This removes the thumb icon from the switch
                thumbIcon={<></>}
            />
        </Tooltip>
    );
});

export default AutoFetchResultsSwitch;
