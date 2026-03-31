import { Switch, Tooltip, type MantineSize } from '@mantine-8/core';
import { memo, useCallback, type FC } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../features/explorer/store';
import { usePreAggregateCacheEnabled } from '../../hooks/usePreAggregateCacheEnabled';

type Props = { size?: MantineSize };

const PreAggregateCacheSwitch: FC<Props> = memo(({ size }) => {
    const dispatch = useExplorerDispatch();
    const [enabled, setEnabled] = usePreAggregateCacheEnabled();

    const handleToggle = useCallback(() => {
        setEnabled(!enabled);
        dispatch(explorerActions.requestQueryExecution());
    }, [dispatch, enabled, setEnabled]);

    return (
        <Tooltip
            label="Route queries through pre-aggregate cache when available"
            position="bottom"
            refProp="rootRef"
            withArrow
            withinPortal
        >
            <Switch
                size={size}
                label="Use pre-aggregate cache"
                checked={enabled}
                onChange={handleToggle}
                thumbIcon={<></>}
            />
        </Tooltip>
    );
});

export default PreAggregateCacheSwitch;
