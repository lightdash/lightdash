import {
    ActionIcon,
    Badge,
    Box,
    Collapse,
    Group,
    ScrollArea,
    Text,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconDatabase,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import type { QueryEvent } from './hooks/useAppSdkBridge';
import classes from './QueryInspector.module.css';

type TrackedQuery = QueryEvent & {
    /** Merged from the initial POST + subsequent poll results */
};

type Props = {
    queries: TrackedQuery[];
};

const statusColor = (status: TrackedQuery['status']): string => {
    switch (status) {
        case 'ready':
            return 'green';
        case 'running':
        case 'pending':
            return 'blue';
        case 'error':
            return 'red';
        default:
            return 'gray';
    }
};

const QueryRow: FC<{ query: TrackedQuery }> = ({ query }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <Box className={classes.queryRow}>
            <Group
                gap="xs"
                wrap="nowrap"
                className={classes.queryHeader}
                onClick={() => setExpanded((v) => !v)}
            >
                <ActionIcon variant="subtle" size="xs" color="gray">
                    {expanded ? (
                        <IconChevronDown size={12} />
                    ) : (
                        <IconChevronRight size={12} />
                    )}
                </ActionIcon>
                <Text size="xs" fw={500} truncate="end">
                    {query.label ||
                        query.exploreName ||
                        query.queryUuid?.slice(0, 8)}
                </Text>
                <Badge
                    size="xs"
                    variant="light"
                    color={statusColor(query.status)}
                >
                    {query.status}
                </Badge>
                {query.rowCount !== null && (
                    <Text size="xs" c="dimmed">
                        {query.rowCount} rows
                    </Text>
                )}
                <Box ml="auto" />
                {query.durationMs !== null && (
                    <Text size="xs" c="dimmed">
                        {query.durationMs}ms
                    </Text>
                )}
            </Group>
            <Collapse in={expanded}>
                <Box className={classes.queryDetails}>
                    {query.dimensions.length > 0 && (
                        <Box>
                            <Text size="xs" fw={600} c="dimmed">
                                Dimensions
                            </Text>
                            <Text size="xs">{query.dimensions.join(', ')}</Text>
                        </Box>
                    )}
                    {query.metrics.length > 0 && (
                        <Box>
                            <Text size="xs" fw={600} c="dimmed">
                                Metrics
                            </Text>
                            <Text size="xs">{query.metrics.join(', ')}</Text>
                        </Box>
                    )}
                    {query.error && (
                        <Box>
                            <Text size="xs" fw={600} c="red">
                                Error
                            </Text>
                            <Text size="xs" c="red">
                                {query.error}
                            </Text>
                        </Box>
                    )}
                    <Box>
                        <Text size="xs" fw={600} c="dimmed">
                            Limit
                        </Text>
                        <Text size="xs">{query.limit}</Text>
                    </Box>
                    {query.queryUuid && (
                        <Box>
                            <Text size="xs" fw={600} c="dimmed">
                                Query UUID
                            </Text>
                            <Text size="xs" ff="monospace">
                                {query.queryUuid}
                            </Text>
                        </Box>
                    )}
                    {query.durationMs !== null && (
                        <Box>
                            <Text size="xs" fw={600} c="dimmed">
                                Warehouse execution time
                            </Text>
                            <Text size="xs">{query.durationMs}ms</Text>
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
};

const QueryInspector: FC<Props> = ({ queries }) => {
    const [collapsed, setCollapsed] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    const toggle = useCallback(() => setCollapsed((v) => !v), []);

    const handleDismiss = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setDismissed(true);
        setCollapsed(true);
    }, []);

    // Nothing to show
    if (queries.length === 0) return null;

    // Dismissed — show a small icon to reopen
    if (dismissed) {
        return (
            <Box className={classes.iconOnly}>
                <ActionIcon
                    variant="filled"
                    color="gray"
                    size="md"
                    radius="xl"
                    onClick={() => setDismissed(false)}
                >
                    <IconDatabase size={14} />
                </ActionIcon>
            </Box>
        );
    }

    return (
        <Box className={classes.container}>
            <Group
                gap="xs"
                wrap="nowrap"
                className={classes.titleBar}
                onClick={toggle}
            >
                <IconDatabase size={14} />
                <Text size="xs" fw={600}>
                    Queries ({queries.length})
                </Text>
                <Box ml="auto" />
                {!collapsed && (
                    <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="gray"
                        onClick={handleDismiss}
                    >
                        <IconX size={12} />
                    </ActionIcon>
                )}
                <ActionIcon variant="subtle" size="xs" color="gray">
                    {collapsed ? (
                        <IconChevronRight size={12} />
                    ) : (
                        <IconChevronDown size={12} />
                    )}
                </ActionIcon>
            </Group>
            <Collapse in={!collapsed}>
                <ScrollArea.Autosize mah={300}>
                    <Box className={classes.queryList}>
                        {queries.map((q) => (
                            <QueryRow key={q.queryUuid ?? q.id} query={q} />
                        ))}
                    </Box>
                </ScrollArea.Autosize>
            </Collapse>
        </Box>
    );
};

export default QueryInspector;
