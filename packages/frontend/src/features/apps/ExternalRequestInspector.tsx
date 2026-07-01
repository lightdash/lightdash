import {
    ActionIcon,
    Badge,
    Box,
    Code,
    Collapse,
    CopyButton,
    Group,
    ScrollArea,
    Text,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconCopy,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './AppInspector.module.css';
import type { ExternalRequestEvent } from './hooks/useAppSdkBridge';

const statusColor = (request: ExternalRequestEvent): string => {
    if (request.status === 'pending') return 'blue';
    if (request.status === 'error') return 'red';
    if (request.httpStatus !== null && request.httpStatus >= 400) return 'red';
    if (
        request.httpStatus !== null &&
        request.httpStatus >= 200 &&
        request.httpStatus < 300
    ) {
        return 'green';
    }
    return 'gray';
};

const statusLabel = (request: ExternalRequestEvent): string =>
    request.status === 'ready' && request.httpStatus !== null
        ? String(request.httpStatus)
        : request.status;

const toJson = (value: unknown): string =>
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);

const ExternalRequestRow: FC<{ request: ExternalRequestEvent }> = ({
    request,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [jsonExpanded, setJsonExpanded] = useState(false);

    const queryEntries = request.query ? Object.entries(request.query) : [];

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
                        <MantineIcon icon={IconChevronDown} size={12} />
                    ) : (
                        <MantineIcon icon={IconChevronRight} size={12} />
                    )}
                </ActionIcon>
                <Badge size="xs" variant="light" color="gray">
                    {request.alias}
                </Badge>
                <Text size="xs" fw={500} truncate="end">
                    {request.method} {request.path}
                </Text>
                <Badge size="xs" variant="light" color={statusColor(request)}>
                    {statusLabel(request)}
                </Badge>
                <Box ml="auto" />
                {request.truncated && (
                    <Badge size="xs" variant="light" color="yellow">
                        truncated
                    </Badge>
                )}
                {request.durationMs !== null && (
                    <Text size="xs" c="dimmed">
                        {request.durationMs}ms
                    </Text>
                )}
            </Group>
            <Collapse in={expanded}>
                <Group
                    gap={0}
                    wrap="nowrap"
                    align="stretch"
                    className={classes.queryDetailsRow}
                >
                    <Box className={classes.queryDetails}>
                        <Box>
                            <Text size="xs" fw={600} c="dimmed">
                                Connection
                            </Text>
                            <Text size="xs">{request.alias}</Text>
                        </Box>
                        <Box>
                            <Text size="xs" fw={600} c="dimmed">
                                Request
                            </Text>
                            <Text size="xs" ff="monospace">
                                {request.method} {request.path}
                            </Text>
                        </Box>
                        {queryEntries.length > 0 && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Query params
                                </Text>
                                <Text size="xs" ff="monospace">
                                    {queryEntries
                                        .map(([k, v]) => `${k}=${v}`)
                                        .join('&')}
                                </Text>
                            </Box>
                        )}
                        {request.requestBody !== null && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Request body
                                </Text>
                                <Code block fz={10}>
                                    {toJson(request.requestBody)}
                                </Code>
                            </Box>
                        )}
                        {request.httpStatus !== null && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Response status
                                </Text>
                                <Text size="xs">{request.httpStatus}</Text>
                            </Box>
                        )}
                        {request.contentType && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Content type
                                </Text>
                                <Text size="xs">{request.contentType}</Text>
                            </Box>
                        )}
                        {request.truncated && (
                            <Box>
                                <Text size="xs" fw={600} c="yellow">
                                    Response truncated
                                </Text>
                                <Text size="xs" c="dimmed">
                                    The upstream response exceeded the
                                    connection's size cap and was truncated.
                                </Text>
                            </Box>
                        )}
                        {request.error && (
                            <Box>
                                <Text size="xs" fw={600} c="red">
                                    Error
                                </Text>
                                <Text size="xs" c="red">
                                    {request.error}
                                </Text>
                            </Box>
                        )}
                        {request.durationMs !== null && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Duration
                                </Text>
                                <Text size="xs">{request.durationMs}ms</Text>
                            </Box>
                        )}
                    </Box>
                    {request.responseBody !== null && (
                        <Box className={classes.rawJsonPanel}>
                            <Group
                                gap={4}
                                onClick={() => setJsonExpanded((v) => !v)}
                                style={{ cursor: 'pointer' }}
                            >
                                <ActionIcon
                                    variant="subtle"
                                    size="xs"
                                    color="gray"
                                >
                                    {jsonExpanded ? (
                                        <MantineIcon
                                            icon={IconChevronDown}
                                            size={10}
                                        />
                                    ) : (
                                        <MantineIcon
                                            icon={IconChevronRight}
                                            size={10}
                                        />
                                    )}
                                </ActionIcon>
                                <Text size="xs" fw={600} c="dimmed">
                                    Response body
                                </Text>
                                <CopyButton
                                    value={toJson(request.responseBody)}
                                >
                                    {({ copied, copy }) => (
                                        <ActionIcon
                                            variant="subtle"
                                            size="xs"
                                            color={copied ? 'green' : 'gray'}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                copy();
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconCopy}
                                                size={10}
                                            />
                                        </ActionIcon>
                                    )}
                                </CopyButton>
                            </Group>
                            <Collapse in={jsonExpanded}>
                                <ScrollArea.Autosize mah={200}>
                                    <Code block fz={10}>
                                        {toJson(request.responseBody)}
                                    </Code>
                                </ScrollArea.Autosize>
                            </Collapse>
                        </Box>
                    )}
                </Group>
            </Collapse>
        </Box>
    );
};

/**
 * Body of the "External requests" inspector tab: the scrollable list of
 * external-connection fetches the app made at runtime. The panel chrome lives
 * in `AppInspectorPanel`.
 */
export const ExternalRequestInspectorContent: FC<{
    requests: ExternalRequestEvent[];
}> = ({ requests }) => (
    <Box className={classes.queryList}>
        {requests.length === 0 ? (
            <Box className={classes.emptyState}>
                <Text size="xs" c="dimmed">
                    No external requests yet
                </Text>
            </Box>
        ) : (
            requests.map((r) => <ExternalRequestRow key={r.id} request={r} />)
        )}
    </Box>
);
