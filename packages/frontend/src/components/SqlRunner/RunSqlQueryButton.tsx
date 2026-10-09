import { Button, Group, Kbd, Loader, Text, Tooltip } from '@mantine/core';
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
    const modifierKey = os === 'macos' || os === 'ios' ? '⌘' : 'Ctrl';

    return (
        <Button.Group>
            <Tooltip
                label={
                    <Group gap={4} wrap="nowrap">
                        <Kbd size="xs">{modifierKey}</Kbd>
                        <Kbd size="xs">↵</Kbd>
                    </Group>
                }
                position="bottom"
                disabled={isLoading || disabled}
            >
                <Button
                    size="xs"
                    leftSection={
                        isLoading ? (
                            <Loader size={14} color="currentColor" />
                        ) : (
                            <MantineIcon icon={IconPlayerPlay} />
                        )
                    }
                    rightSection={
                        <Text component="span" fz="xs" fw={400} opacity={0.6}>
                            {modifierKey}↵
                        </Text>
                    }
                    onClick={onSubmit}
                    disabled={disabled || isLoading}
                    // Anchor for scope walkthroughs (data-tour-via)
                    data-tour-anchor="sql-runner-run"
                    data-tour-hint="Run the query"
                    data-testid="sql-runner-run-button"
                >
                    Run
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
