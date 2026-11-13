import { Switch, Tooltip, type MantineSize } from '@mantine/core';
import { memo, type FC } from 'react';
import { useAutoFetch } from './useAutoFetch';

const AutoFetchResultsSwitch: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const { isEnabled, toggle } = useAutoFetch();

    return (
        <Tooltip
            label="Automatically re-run query on change (e.g. add fields, change sort)"
            position="bottom"
            refProp="rootRef"
        >
            <Switch
                size={size}
                label="Auto-fetch results"
                checked={isEnabled}
                onChange={toggle}
                // This removes the thumb icon from the switch
                thumbIcon={<></>}
            />
        </Tooltip>
    );
});

export default AutoFetchResultsSwitch;
