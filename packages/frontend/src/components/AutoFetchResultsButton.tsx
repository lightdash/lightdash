import { ActionIcon, Tooltip, type MantineSize } from '@mantine/core';
import { IconRefresh, IconRefreshOff } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import MantineIcon from './common/MantineIcon';

export const AutoFetchResultsButton: FC<{ size?: MantineSize }> = memo(
    ({ size }) => {
        const autoFetchEnabled = useExplorerContext(
            (context) => context.state.autoFetchEnabled,
        );
        const setAutoFetchEnabled = useExplorerContext(
            (context) => context.actions.setAutoFetchEnabled,
        );

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
                >
                    <MantineIcon
                        icon={autoFetchEnabled ? IconRefresh : IconRefreshOff}
                    />
                </ActionIcon>
            </Tooltip>
        );
    },
);
