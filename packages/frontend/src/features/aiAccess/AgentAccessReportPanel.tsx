import {
    type AgentAccessReport,
    type AgentTableStatus,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Box,
    Group,
    Paper,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { IconCheck, IconX, IconQuestionMark } from '@tabler/icons-react';
import dayjs from 'dayjs';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './AgentAccessReportPanel.module.css';

const reasonLabels: Record<NonNullable<AgentTableStatus['reason']>, string> = {
    access_denied: 'Access denied',
    not_found: 'Table not found',
    quota: 'Quota reached',
    timeout: 'Timed out',
    unavailable: 'BigQuery unavailable',
    unsupported: 'Query could not be validated',
    unknown: 'Unknown error',
};

export const AgentAccessReportPanel = ({
    report,
}: {
    report: AgentAccessReport;
}) => {
    if (report.status === 'failed')
        return (
            <Alert color="red" role="alert">
                {report.message ?? 'Could not verify agent access.'}
            </Alert>
        );
    const multipleProjects =
        new Set(report.datasets.map((dataset) => dataset.database)).size > 1;
    const scope =
        report.datasets.length > 1
            ? 'across these datasets'
            : 'in this dataset';
    return (
        <Paper className={classes.panel}>
            <Stack gap={0}>
                <Group p="sm" gap="xs" bg="ldGray.1" role="status">
                    <Badge
                        color={report.status === 'partial' ? 'yellow' : 'green'}
                    >
                        {report.status === 'partial'
                            ? 'Check incomplete'
                            : 'Passed'}
                    </Badge>
                    <Text size="sm">Agents will run as</Text>
                    <Text size="sm" className={classes.identifier}>
                        {report.principal}
                    </Text>
                </Group>
                <Box
                    className={classes.tables}
                    tabIndex={0}
                    role="region"
                    aria-label="Agent table access"
                >
                    <Table aria-label="Agent table access results">
                        <Table.Tbody>
                            {report.tables.map((table) => (
                                <Table.Tr
                                    key={JSON.stringify([
                                        table.database,
                                        table.schema,
                                        table.name,
                                    ])}
                                >
                                    <Table.Td>
                                        <Group gap="xs" wrap="nowrap">
                                            <MantineIcon
                                                icon={
                                                    table.status.kind ===
                                                    'readable'
                                                        ? IconCheck
                                                        : table.status.kind ===
                                                            'blocked'
                                                          ? IconX
                                                          : IconQuestionMark
                                                }
                                                color={
                                                    table.status.kind ===
                                                    'readable'
                                                        ? 'green'
                                                        : table.status.kind ===
                                                            'blocked'
                                                          ? 'red'
                                                          : 'dimmed'
                                                }
                                            />
                                            <Text
                                                size="sm"
                                                className={classes.identifier}
                                            >
                                                {multipleProjects
                                                    ? `${table.database}.`
                                                    : ''}
                                                {table.schema}.{table.name}
                                            </Text>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td className={classes.result}>
                                        <Text size="xs" c="dimmed">
                                            {table.status.kind === 'readable'
                                                ? 'can read'
                                                : table.status.kind ===
                                                    'blocked'
                                                  ? 'blocked by BigQuery'
                                                  : 'could not check'}
                                        </Text>
                                        {table.status.kind !== 'readable' &&
                                            table.status.kind !== 'blocked' && (
                                                <Text size="xs" c="dimmed">
                                                    {
                                                        reasonLabels[
                                                            table.status.reason
                                                        ]
                                                    }
                                                </Text>
                                            )}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                            {report.truncatedCount > 0 && (
                                <Table.Tr>
                                    <Table.Td colSpan={2}>
                                        <Text size="xs" c="dimmed">
                                            and {report.truncatedCount} more
                                            (not checked)
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            )}
                        </Table.Tbody>
                    </Table>
                </Box>
                <Stack p="sm" gap="xs">
                    <Text size="xs" c="dimmed" role="status">
                        {report.totalCount === 0
                            ? `No tables are visible to this connection ${scope}.`
                            : report.status === 'partial'
                              ? `People keep their own access. Agents can read ${report.readableCount} of ${report.checkedCount} checked tables. ${report.totalCount} tables are listed ${scope}. ${report.errorCount} unknown; ${report.notCheckedCount + report.truncatedCount} not checked.`
                              : `People keep their own access. Agents can read ${report.readableCount} of ${report.totalCount} tables ${scope}.`}
                    </Text>
                    {report.datasets.length > 1 && (
                        <Text
                            size="xs"
                            c="dimmed"
                            className={classes.identifier}
                        >
                            Scope:{' '}
                            {report.datasets
                                .map(
                                    (dataset) =>
                                        `${dataset.database}.${dataset.schema}`,
                                )
                                .join(', ')}
                        </Text>
                    )}
                    <Text size="xs" c="dimmed">
                        Checked {dayjs(report.checkedAt).format('HH:mm')}. The
                        check reads no rows; row-level policies can still limit
                        results.
                    </Text>
                </Stack>
            </Stack>
        </Paper>
    );
};
