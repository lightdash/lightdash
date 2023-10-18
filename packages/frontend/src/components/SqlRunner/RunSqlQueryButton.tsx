import { Box, Group, Kbd, MantineProvider, Text, Tooltip } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { FC } from 'react';
import { BigButton } from '../common/BigButton';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    onSubmit: () => void;
}> = ({ onSubmit, isLoading }) => {
    const os = useOs();
    return (
        <Tooltip
            label={
                <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
                    <Group spacing="xxs">
                        <Kbd fw={600}>
                            {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                        </Kbd>

                        <Text fw={600}>+</Text>

                        <Kbd fw={600}>Enter</Kbd>
                    </Group>
                </MantineProvider>
            }
            position="bottom"
            withArrow
            withinPortal
            disabled={isLoading}
        >
            <Box>
                <BigButton
                    icon="play"
                    intent="primary"
                    style={{ width: 150 }}
                    onClick={onSubmit}
                    loading={isLoading}
                >
                    Run query
                </BigButton>
            </Box>
        </Tooltip>
    );
};

export default RunSqlQueryButton;
