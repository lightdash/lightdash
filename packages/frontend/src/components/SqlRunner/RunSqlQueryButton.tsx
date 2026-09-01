import { Button, Group, Kbd, Tooltip } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';
import { type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import MantineIcon from '../common/MantineIcon';
import RunQuerySettings from '../RunQuerySettings';

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
                    <Group gap={4} wrap="nowrap">
                        <Kbd size="xs">
                            {os === 'macos' || os === 'ios' ? '⌘' : 'Ctrl'}
                        </Kbd>
                        <Kbd size="xs">↵</Kbd>
                    </Group>
                }
                position="bottom"
                disabled={isLoading || disabled}
            >
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={onSubmit}
                    loading={isLoading}
                    disabled={disabled}
                >
                    Run query
                </Button>
            </Tooltip>
            {onLimitChange !== undefined && (
                <RunQuerySettings
                    disabled={disabled}
                    size="xs"
                    maxLimit={maxLimit}
                    limit={limit || 500}
                    onLimitChange={onLimitChange}
                />
            )}
        </Button.Group>
    );
};

export default RunSqlQueryButton;
