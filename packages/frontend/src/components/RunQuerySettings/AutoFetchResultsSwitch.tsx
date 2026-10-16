import { Switch, Tooltip, type MantineSize } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { AUTO_FETCH_ENABLED_DEFAULT, AUTO_FETCH_ENABLED_KEY } from './defaults';

const AutoFetchResultsSwitch: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const { t } = useTranslation('explorer');
    const [autoFetchEnabled, setAutoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

    return (
        <Tooltip
            label={t('runQuerySettings.autoFetch.tooltip')}
            position="bottom"
            refProp="rootRef"
        >
            <Switch
                size={size}
                label={t('runQuerySettings.autoFetch.label')}
                checked={autoFetchEnabled}
                onChange={() => setAutoFetchEnabled(!autoFetchEnabled)}
                // This removes the thumb icon from the switch
                thumbIcon={<></>}
            />
        </Tooltip>
    );
});

export default AutoFetchResultsSwitch;
