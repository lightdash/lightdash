import { type PreAggregateMaterializationSummary } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Collapse,
    Drawer,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChevronDown,
    IconChevronRight,
    IconRefresh,
} from '@tabler/icons-react';
import cronstrue from 'cronstrue';
import { type FC } from 'react';
import { LD_FIELD_COLORS } from '../../mantineTheme';
import MantineIcon from '../common/MantineIcon';
import { StatusBadge } from './StatusBadge';

const TRIGGER_LABELS: Record<string, string> = {
    compile: 'Project compile',
    cron: 'Scheduled (cron)',
    manual: 'Manual',
    webhook: 'Webhook',
};

const DetailLabel: FC<{ children: React.ReactNode }> = ({ children }) => (
    <Text fz="xs" c="ldGray.5" fw={600} tt="uppercase" lts={0.5}>
        {children}
    </Text>
);

const DetailValue: FC<{ children: React.ReactNode; mono?: boolean }> = ({
    children,
    mono,
}) => (
    <Text fz="sm" fw={400} ff={mono ? 'monospace' : undefined} c="ldGray.8">
        {children}
    </Text>
);

const ColumnsSection: FC<{
    columns: [string, { type: string }][];
}> = ({ columns }) => {
    const [opened, { toggle }] = useDisclosure(true);

    return (
        <Box>
            <UnstyledButton onClick={toggle} w="100%">
                <Group gap="xs">
                    <DetailLabel>Columns ({columns.length})</DetailLabel>
                    <MantineIcon
                        icon={opened ? IconChevronDown : IconChevronRight}
                        size="sm"
                        color="ldGray.5"
                    />
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>
                <Stack gap={2} mt="xs">
                    {columns.map(([name, col]) => (
                        <Group
                            key={name}
                            gap="xs"
                            justify="space-between"
                            px="xs"
                            py={4}
                            style={{
                                borderRadius: 'var(--mantine-radius-sm)',
                                backgroundColor:
                                    'var(--mantine-color-ldGray-0)',
                            }}
                        >
                            <Text fz="xs" ff="monospace">
                                {name}
                            </Text>
                            <Badge variant="outline" color="gray" size="xs">
                                {col.type}
                            </Badge>
                        </Group>
                    ))}
                </Stack>
            </Collapse>
        </Box>
    );
};

type Props = {
    summary: PreAggregateMaterializationSummary | null;
    opened: boolean;
    onClose: () => void;
    onRefresh: (preAggExploreName: string) => void;
    isRefreshing: boolean;
};

const MaterializationDetailDrawer: FC<Props> = ({
    summary,
    opened,
    onClose,
    onRefresh,
    isRefreshing,
}) => {
    if (!summary) return null;

    const { materialization } = summary;
    const columnEntries = materialization?.columns
        ? Object.entries(materialization.columns)
        : [];

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="md"
            title={
                <Group gap="xs">
                    <Text fw={600} fz="md">
                        {summary.preAggregateName}
                    </Text>
                    <StatusBadge summary={summary} />
                </Group>
            }
        >
            <Stack gap="lg">
                <Box>
                    <DetailLabel>Source explore</DetailLabel>
                    <DetailValue mono>{summary.sourceExploreName}</DetailValue>
                </Box>

                <Box>
                    <DetailLabel>Metrics</DetailLabel>
                    <Group gap="xs" mt={4}>
                        {summary.metrics.map((m) => (
                            <Badge
                                key={m}
                                variant="light"
                                bg={LD_FIELD_COLORS.metric.bg}
                                c={LD_FIELD_COLORS.metric.color}
                                size="sm"
                                ff="monospace"
                            >
                                {m}
                            </Badge>
                        ))}
                    </Group>
                </Box>

                <Box>
                    <DetailLabel>Dimensions</DetailLabel>
                    <Group gap="xs" mt={4}>
                        {summary.dimensions.map((d) => (
                            <Badge
                                key={d}
                                variant="light"
                                bg={LD_FIELD_COLORS.dimension.bg}
                                c={LD_FIELD_COLORS.dimension.color}
                                size="sm"
                                ff="monospace"
                            >
                                {d}
                            </Badge>
                        ))}
                    </Group>
                </Box>

                {summary.timeDimension && (
                    <Group gap="xl">
                        <Box>
                            <DetailLabel>Time dimension</DetailLabel>
                            <DetailValue mono>
                                {summary.timeDimension}
                            </DetailValue>
                        </Box>
                        {summary.granularity && (
                            <Box>
                                <DetailLabel>Granularity</DetailLabel>
                                <DetailValue mono>
                                    {summary.granularity}
                                </DetailValue>
                            </Box>
                        )}
                    </Group>
                )}

                {summary.refreshCron && (
                    <Box>
                        <DetailLabel>Refresh schedule</DetailLabel>
                        <DetailValue mono>
                            {summary.refreshCron}{' '}
                            <Text fz="xs" c="ldGray.5">
                                (
                                {cronstrue.toString(summary.refreshCron, {
                                    throwExceptionOnParseError: false,
                                })}
                                )
                            </Text>
                        </DetailValue>
                    </Box>
                )}

                {summary.definitionError && (
                    <Box>
                        <DetailLabel>Definition error</DetailLabel>
                        <Text fz="sm" c="red">
                            {summary.definitionError}
                        </Text>
                    </Box>
                )}

                {materialization && (
                    <>
                        <Box
                            style={{
                                borderTop:
                                    '1px solid var(--mantine-color-ldGray-2)',
                            }}
                            pt="md"
                        >
                            <Group justify="space-between" mb="sm">
                                <Text fz="sm" fw={600}>
                                    Last materialization
                                </Text>
                                <Tooltip label="Refresh this pre-aggregate">
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="sm"
                                        loading={isRefreshing}
                                        onClick={() =>
                                            onRefresh(summary.preAggExploreName)
                                        }
                                    >
                                        <MantineIcon
                                            icon={IconRefresh}
                                            size="sm"
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                            <Stack gap="sm">
                                <Group gap="xl">
                                    <Box>
                                        <DetailLabel>Trigger</DetailLabel>
                                        <DetailValue>
                                            {TRIGGER_LABELS[
                                                materialization.trigger
                                            ] ?? materialization.trigger}
                                        </DetailValue>
                                    </Box>
                                    {materialization.materializedAt && (
                                        <Box>
                                            <DetailLabel>
                                                Materialized at
                                            </DetailLabel>
                                            <DetailValue>
                                                {new Date(
                                                    materialization.materializedAt,
                                                ).toLocaleString()}
                                            </DetailValue>
                                        </Box>
                                    )}
                                </Group>

                                {materialization.rowCount != null && (
                                    <Box>
                                        <DetailLabel>Row count</DetailLabel>
                                        <DetailValue mono>
                                            {materialization.rowCount.toLocaleString()}
                                        </DetailValue>
                                    </Box>
                                )}

                                {materialization.errorMessage && (
                                    <Box>
                                        <DetailLabel>Error</DetailLabel>
                                        <Text fz="sm" c="red">
                                            {materialization.errorMessage}
                                        </Text>
                                    </Box>
                                )}
                            </Stack>
                        </Box>

                        {columnEntries.length > 0 && (
                            <ColumnsSection columns={columnEntries} />
                        )}
                    </>
                )}
            </Stack>
        </Drawer>
    );
};

export default MaterializationDetailDrawer;
