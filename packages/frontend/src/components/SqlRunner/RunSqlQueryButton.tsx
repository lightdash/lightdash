import {
    Box,
    Button,
    Group,
    Kbd,
    MantineProvider,
    Text,
    Tooltip,
} from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    disabled?: boolean;
    onSubmit: () => void;
}> = ({ onSubmit, isLoading, disabled = false }) => {
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
                <Button
                    size="xs"
                    leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={onSubmit}
                    loading={isLoading}
                    disabled={disabled}
                >
                    Run query
                </Button>
            </Box>
        </Tooltip>
    );
};

export default RunSqlQueryButton;
