import {
    type PreAggregateMaterializationSummary,
    type PreAggregateMaterializationWarning,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Collapse,
    Drawer,
    getDefaultZIndex,
    Group,
    List,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconAlertTriangle,
    IconBolt,
    IconCalendarClock,
    IconChevronDown,
    IconChevronRight,
    IconClock,
    IconDatabase,
    IconFile,
    IconFilterExclamation,
    IconHourglass,
    IconRefresh,
    IconTableRow,
} from '@tabler/icons-react';
import cronstrue from 'cronstrue';
import { type FC } from 'react';
import { LD_FIELD_COLORS } from '../../mantineTheme';
import Callout from '../common/Callout';
import MantineIcon from '../common/MantineIcon';
import { IconBox } from '../common/ResourceIcon';
import { formatDuration, formatFileSize } from './formatters';

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
    onRefresh: (preAggregateName: string) => void;
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
            zIndex={getDefaultZIndex('max') + 1}
            title={
                <Group gap="xs">
                    <IconBox icon={IconBolt} color="ldDark.9" />
                    <Text fw={600} fz="sm">
                        Pre-aggregate details
                    </Text>
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

                {summary.warnings.length > 0 && (
                    <Box>
                        <DetailLabel>Warnings</DetailLabel>
                        <Callout variant="warning" p="xs" hideIcon>
                            <List
                                styles={{
                                    itemWrapper: { alignItems: 'flex-start' },
                                }}
                            >
                                {summary.warnings.map(
                                    (
                                        warning: PreAggregateMaterializationWarning,
                                    ) => (
                                        <List.Item
                                            fz="xs"
                                            key={warning.type}
                                            icon={
                                                <Box pt={2}>
                                                    <MantineIcon
                                                        icon={
                                                            warning.type ===
                                                            'max_rows_applied'
                                                                ? IconFilterExclamation
                                                                : IconAlertTriangle
                                                        }
                                                        size="sm"
                                                    />
                                                </Box>
                                            }
                                        >
                                            {warning.message}
                                        </List.Item>
                                    ),
                                )}
                            </List>
                        </Callout>
                    </Box>
                )}

                {materialization && (
                    <>
                        <Box
                            style={{
                                borderTop:
                                    '1px dashed var(--mantine-color-ldGray-2)',
                            }}
                            pt="md"
                        >
                            <Group justify="space-between" mb="sm">
                                <Group gap="xs">
                                    <IconBox
                                        icon={IconDatabase}
                                        color="ldDark.9"
                                        fill={undefined}
                                    />
                                    <Text fw={600} fz="sm">
                                        Last materialization
                                    </Text>
                                </Group>
                                <Tooltip label="Refresh this pre-aggregate">
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="sm"
                                        loading={isRefreshing}
                                        onClick={() =>
                                            onRefresh(summary.preAggregateName)
                                        }
                                    >
                                        <MantineIcon
                                            icon={IconRefresh}
                                            size="sm"
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                            <Stack gap="xs">
                                <Group gap={4}>
                                    <MantineIcon
                                        icon={IconCalendarClock}
                                        color="ldGray.6"
                                    />
                                    <Text size="sm" c="ldGray.6">
                                        Trigger:{' '}
                                        {TRIGGER_LABELS[
                                            materialization.trigger
                                        ] ?? materialization.trigger}
                                    </Text>
                                </Group>

                                {materialization.materializedAt && (
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconClock}
                                            color="ldGray.6"
                                        />
                                        <Text size="sm" c="ldGray.6">
                                            Materialized at:{' '}
                                            {new Date(
                                                materialization.materializedAt,
                                            ).toLocaleString()}
                                        </Text>
                                    </Group>
                                )}

                                {materialization.rowCount != null && (
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconTableRow}
                                            color="ldGray.6"
                                        />
                                        <Text size="sm" c="ldGray.6">
                                            Rows:{' '}
                                            {materialization.rowCount.toLocaleString()}
                                        </Text>
                                    </Group>
                                )}

                                {materialization.totalBytes != null && (
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconFile}
                                            color="ldGray.6"
                                        />
                                        <Text size="sm" c="ldGray.6">
                                            File size:{' '}
                                            {formatFileSize(
                                                materialization.totalBytes,
                                            )}
                                        </Text>
                                    </Group>
                                )}

                                {materialization.durationMs != null && (
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconHourglass}
                                            color="ldGray.6"
                                        />
                                        <Text size="sm" c="ldGray.6">
                                            Build time:{' '}
                                            {formatDuration(
                                                materialization.durationMs,
                                            )}
                                        </Text>
                                    </Group>
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
