import { Switch, Tooltip, type MantineSize } from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import { memo, type FC } from 'react';
import { AUTO_FETCH_ENABLED_DEFAULT, AUTO_FETCH_ENABLED_KEY } from './defaults';

const AutoFetchResultsSwitch: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [autoFetchEnabled, setAutoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

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
