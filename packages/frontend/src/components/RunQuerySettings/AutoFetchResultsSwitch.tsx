import { Switch, type MantineSize } from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import { memo, type FC } from 'react';
import { AUTO_FETCH_ENABLED_DEFAULT, AUTO_FETCH_ENABLED_KEY } from './defaults';

const AutoFetchResultsSwitch: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [autoFetchEnabled, setAutoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

    return (
        <Switch
            size={size}
            label="Auto-fetch results"
            checked={autoFetchEnabled}
            onChange={() => setAutoFetchEnabled(!autoFetchEnabled)}
            // This removes the thumb icon from the switch
            thumbIcon={<></>}
        />
    );
});

export default AutoFetchResultsSwitch;
