import {
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
import LimitButton from '../LimitButton';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    limit: number;
    disabled?: boolean;
    onLimitChange: (limit: number) => void;
    onSubmit: () => void;
}> = ({ onSubmit, onLimitChange, isLoading, limit, disabled = false }) => {
    const os = useOs();
    return (
        <Button.Group>
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
                <Button
                    size="xs"
                    pr="xxs"
                    leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={onSubmit}
                    loading={isLoading}
                    disabled={disabled}
                    sx={(theme) => ({
                        flex: 1,
                        borderRight: `1px solid ${theme.fn.rgba(
                            theme.colors.gray[5],
                            0.6,
                        )}`,
                    })}
                >
                    Run query ({limit})
                </Button>
            </Tooltip>
            <LimitButton
                disabled={disabled}
                size="xs"
                limit={10}
                onLimitChange={onLimitChange}
            />
        </Button.Group>
    );
};

export default RunSqlQueryButton;
