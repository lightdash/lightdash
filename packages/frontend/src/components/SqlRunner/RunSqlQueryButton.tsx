import { Button, Group, Kbd, rgba, Text, Tooltip } from '@mantine-8/core';
import { useOs } from '@mantine-8/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';
import { type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import RunQuerySettings from '../RunQuerySettings';
import MantineIcon from '../common/MantineIcon';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    limit?: number;
    disabled?: boolean;
    onLimitChange?: (limit: number) => void;
    onSubmit: () => void;
}> = ({ onSubmit, onLimitChange, isLoading, limit, disabled = false }) => {
    const health = useHealth();
    const maxLimit = health.data?.query.maxLimit ?? 5000;

    const os = useOs();
    return (
        <Button.Group>
            <Tooltip
                label={
                    <Group gap="xxs">
                        <Kbd fw={600}>
                            {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                        </Kbd>

                        <Text fw={600}>+</Text>

                        <Kbd fw={600}>Enter</Kbd>
                    </Group>
                }
                position="bottom"
                withArrow
                withinPortal
                disabled={isLoading}
            >
                <Button
                    size="xs"
                    pr={limit ? 'xs' : undefined}
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={onSubmit}
                    loading={isLoading}
                    disabled={disabled}
                    style={(theme) => ({
                        flex: 1,
                        borderRight: !disabled
                            ? `1px solid ${rgba(theme.colors.ldGray[5], 0.6)}`
                            : undefined,

                        ...(onLimitChange !== undefined && {
                            borderTopRightRadius: 0,
                            borderBottomRightRadius: 0,
                        }),
                    })}
                >
                    {`Run query ${limit ? `(${limit})` : ''}`}
                </Button>
            </Tooltip>
            {onLimitChange !== undefined && (
                <RunQuerySettings
                    disabled={disabled}
                    size="xs"
                    maxLimit={maxLimit}
                    limit={limit || 500}
                    onLimitChange={onLimitChange}
                    targetProps={{
                        style: {
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                        },
                    }}
                />
            )}
        </Button.Group>
    );
};

export default RunSqlQueryButton;
