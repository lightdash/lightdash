import { Switch, Tooltip, type MantineSize } from '@mantine/core';
import { memo, useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../features/explorer/store';
import { usePreAggregateCacheEnabled } from '../../hooks/usePreAggregateCacheEnabled';

type Props = { size?: MantineSize };

const PreAggregateCacheSwitch: FC<Props> = memo(({ size }) => {
    const { t } = useTranslation('explorer');
    const dispatch = useExplorerDispatch();
    const [enabled, setEnabled] = usePreAggregateCacheEnabled();

    const handleToggle = useCallback(() => {
        setEnabled(!enabled);
        dispatch(explorerActions.requestQueryExecution());
    }, [dispatch, enabled, setEnabled]);

    return (
        <Tooltip
            label={t('runQuerySettings.preAggregateCache.tooltip')}
            position="bottom"
            refProp="rootRef"
        >
            <Switch
                size={size}
                label={t('runQuerySettings.preAggregateCache.label')}
                checked={enabled}
                onChange={handleToggle}
                thumbIcon={<></>}
            />
        </Tooltip>
    );
});

export default PreAggregateCacheSwitch;
