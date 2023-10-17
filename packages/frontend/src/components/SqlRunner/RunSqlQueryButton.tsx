import { Button, Group, Kbd, Text, Tooltip } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconPlayerPlayFilled } from '@tabler/icons-react';
import React, { FC } from 'react';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    onSubmit: () => void;
}> = ({ onSubmit, isLoading }) => {
    const os = useOs();
    return (
        <Tooltip
            label={
                <Group spacing="xxs">
                    <Kbd
                        fw={600}
                        sx={{
                            backgroundColor: '#2C2E33',
                            color: '#C1C2C5',
                            border: 'none',
                        }}
                    >
                        {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                    </Kbd>

                    <Text color="dimmed" fw={600}>
                        +
                    </Text>

                    <Kbd
                        fw={600}
                        sx={{
                            backgroundColor: '#2C2E33',
                            color: '#C1C2C5',
                            border: 'none',
                        }}
                    >
                        enter
                    </Kbd>
                </Group>
            }
            position="left"
            withArrow
            disabled={isLoading}
            sx={{ padding: '10px' }}
        >
            <Button
                leftIcon={<IconPlayerPlayFilled size="1rem" />}
                loading={isLoading}
                onClick={onSubmit}
                sx={{
                    width: 150,
                    height: '40px',
                }}
            >
                Run query
            </Button>
        </Tooltip>
    );
};

export default RunSqlQueryButton;
