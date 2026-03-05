import { Switch, Tooltip, type MantineSize } from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import { memo, type FC } from 'react';
import {
    PRE_AGGREGATE_CACHE_ENABLED_DEFAULT,
    PRE_AGGREGATE_CACHE_ENABLED_KEY,
} from './defaults';

const PreAggregateCacheSwitch: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [preAggCacheEnabled, setPreAggCacheEnabled] = useLocalStorage({
        key: PRE_AGGREGATE_CACHE_ENABLED_KEY,
        defaultValue: PRE_AGGREGATE_CACHE_ENABLED_DEFAULT,
    });

    return (
        <Tooltip
            label="When enabled, matching queries run against pre-aggregate cache (DuckDB) instead of the warehouse"
            position="bottom"
            refProp="rootRef"
            withArrow
            withinPortal
        >
            <Switch
                size={size}
                label="Use pre-aggregate cache"
                checked={preAggCacheEnabled}
                onChange={() => setPreAggCacheEnabled(!preAggCacheEnabled)}
                thumbIcon={<></>}
            />
        </Tooltip>
    );
});

export default PreAggregateCacheSwitch;
