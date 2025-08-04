import { ActionIcon, Tooltip, type MantineSize } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconRefresh, IconRefreshOff } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { AUTO_FETCH_ENABLED_DEFAULT, AUTO_FETCH_ENABLED_KEY } from './defaults';

export const AutoFetchResultsButton: FC<{ size?: MantineSize }> = memo(
    ({ size }) => {
        const [autoFetchEnabled, setAutoFetchEnabled] = useLocalStorage({
            key: AUTO_FETCH_ENABLED_KEY,
            defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
        });

        return (
            <Tooltip
                label={`Auto-fetch results ${
                    autoFetchEnabled ? 'enabled' : 'disabled'
                }`}
                position="bottom"
                withArrow
                withinPortal
            >
                <ActionIcon
                    size={size}
                    variant="default"
                    onClick={() => setAutoFetchEnabled(!autoFetchEnabled)}
                    sx={(theme) => ({
                        color: autoFetchEnabled
                            ? theme.colors.blue[6]
                            : undefined,
                    })}
                >
                    <MantineIcon
                        icon={autoFetchEnabled ? IconRefresh : IconRefreshOff}
                    />
                </ActionIcon>
            </Tooltip>
        );
    },
);
