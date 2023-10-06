import { Tooltip2 } from '@blueprintjs/popover2';
import { Group, Kbd, Text } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import React, { FC } from 'react';
import { BigButton } from '../common/BigButton';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    onSubmit: () => void;
}> = ({ onSubmit, isLoading }) => {
    const os = useOs();
    return (
        <Tooltip2
            content={
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
            disabled={isLoading}
        >
            <BigButton
                icon="play"
                intent="primary"
                style={{ width: 150 }}
                onClick={onSubmit}
                loading={isLoading}
            >
                Run query
            </BigButton>
        </Tooltip2>
    );
};

export default RunSqlQueryButton;
