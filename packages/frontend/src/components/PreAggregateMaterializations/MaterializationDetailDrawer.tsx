import {
    FilterOperator,
    getCurrentPeriodBounds,
    type PreAggregateMaterializationRole,
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
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconBolt,
    IconCalendarClock,
    IconChevronDown,
    IconChevronRight,
    IconClock,
    IconDatabase,
    IconDatabaseExport,
    IconFile,
    IconFilterExclamation,
    IconHourglass,
    IconRefreshDot,
    IconTableRow,
} from '@tabler/icons-react';
import cronstrue from 'cronstrue';
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { LD_FIELD_COLORS } from '../../theme';
import { formatDuration, formatFileSize } from '../../utils/formatters';
import Callout from '../common/Callout';
import { filterOperatorLabel } from '../common/Filters/FilterInputs/constants';
import MantineIcon from '../common/MantineIcon';
import { IconBox } from '../common/ResourceIcon';
import TruncatedText from '../common/TruncatedText';

const KNOWN_TRIGGERS = ['compile', 'cron', 'manual', 'webhook'];

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

const formatFilterValue = (
    filter: PreAggregateMaterializationSummary['filters'][number],
    t: TFunction,
) => {
    const { operator, values, settings } = filter;

    switch (operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return null;
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT: {
            const bounds = getCurrentPeriodBounds(settings);
            const bound = bounds.excludeToday
                ? t('materializationDrawer.filterBound.toDateExcludingToday')
                : bounds.toDate
                  ? t('materializationDrawer.filterBound.toDate')
                  : '';
            return `${
                settings?.completed
                    ? t('materializationDrawer.filterBound.completed')
                    : ''
            }${settings?.unitOfTime?.slice(0, -1) ?? 'day'}${bound}`;
        }
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            return `${values?.[0] ?? ''} ${
                settings?.completed
                    ? t('materializationDrawer.filterBound.completed')
                    : ''
            }${settings?.unitOfTime ?? ''}`.trim();
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_BETWEEN:
            return values?.filter((value) => value != null).join(', ') ?? null;
        default:
            return values?.filter((value) => value != null).join(', ') ?? null;
    }
};

const ColumnsSection: FC<{
    columns: [string, { type: string }][];
}> = ({ columns }) => {
    const { t } = useTranslation('app');
    const [opened, { toggle }] = useDisclosure(true);

    return (
        <Box>
            <UnstyledButton onClick={toggle} w="100%">
                <Group gap="xs">
                    <DetailLabel>
                        {t('materializationDrawer.columnsCount', {
                            count: columns.length,
                        })}
                    </DetailLabel>
                    <MantineIcon
                        icon={opened ? IconChevronDown : IconChevronRight}
                        size="sm"
                        color="ldGray.5"
                    />
                </Group>
            </UnstyledButton>
            <Collapse expanded={opened}>
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
                            <Badge variant="outline" size="xs">
                                {col.type}
                            </Badge>
                        </Group>
                    ))}
                </Stack>
            </Collapse>
        </Box>
    );
};

const MaterializationRoleSection: FC<{
    materializationRole: PreAggregateMaterializationRole;
}> = ({ materializationRole }) => {
    const { t } = useTranslation('app');
    const attributeEntries = Object.entries(materializationRole.attributes);

    return (
        <Box>
            <DetailLabel>{t('materializationDrawer.role')}</DetailLabel>
            <Stack gap="sm" mt={4}>
                <Box>
                    <DetailLabel>
                        {t('materializationDrawer.email')}
                    </DetailLabel>
                    <DetailValue mono>{materializationRole.email}</DetailValue>
                </Box>

                <Box>
                    <DetailLabel>
                        {t('materializationDrawer.attributes')}
                    </DetailLabel>
                    <Stack gap={6} mt={4}>
                        {attributeEntries.map(([attributeName, values]) => (
                            <Box
                                key={attributeName}
                                px="xs"
                                py={6}
                                style={{
                                    borderRadius: 'var(--mantine-radius-sm)',
                                    backgroundColor:
                                        'var(--mantine-color-ldGray-0)',
                                }}
                            >
                                <Stack gap={6}>
                                    <Text fz="xs" ff="monospace">
                                        {attributeName}
                                    </Text>
                                    <Group gap={4}>
                                        {values.map((value) => (
                                            <Badge
                                                key={`${attributeName}-${value}`}
                                                variant="outline"
                                                size="xs"
                                                ff="monospace"
                                            >
                                                {value}
                                            </Badge>
                                        ))}
                                    </Group>
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </Box>
            </Stack>
        </Box>
    );
};

const FiltersSection: FC<{
    filters: PreAggregateMaterializationSummary['filters'];
}> = ({ filters }) => {
    const { t } = useTranslation('app');
    return (
        <Box>
            <DetailLabel>{t('materializationDrawer.filters')}</DetailLabel>
            <Stack gap={6} mt={4}>
                {filters.map((filter, index) => {
                    const value = formatFilterValue(filter, t);

                    return (
                        <Box
                            key={filter.id}
                            px="xs"
                            py={6}
                            style={{
                                borderRadius: 'var(--mantine-radius-sm)',
                            }}
                        >
                            <Group gap={6} wrap="wrap" align="center">
                                <Badge size="xs" ff="monospace">
                                    {filter.target.fieldRef}
                                </Badge>
                                <Text fz="xs" c="dimmed" fw={500}>
                                    {filterOperatorLabel[filter.operator]}
                                </Text>
                                {value && (
                                    <Badge
                                        variant="outline"
                                        size="xs"
                                        ff="monospace"
                                    >
                                        {value}
                                    </Badge>
                                )}
                            </Group>
                            {index < filters.length - 1 && (
                                <Text fz="xs" c="ldGray.5" fw={600} mt={4}>
                                    {t('materializationDrawer.and')}
                                </Text>
                            )}
                        </Box>
                    );
                })}
            </Stack>
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
    const { t } = useTranslation('app');
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
                    <IconBox
                        icon={
                            summary.externalTable
                                ? IconDatabaseExport
                                : IconBolt
                        }
                        color="ldDark.9"
                    />
                    <Stack gap={0}>
                        <TruncatedText
                            maxWidth={280}
                            fw={600}
                            fz="sm"
                            ff="monospace"
                        >
                            {summary.preAggregateName}
                        </TruncatedText>
                        <Text fz="xs" c="dimmed">
                            {t('materializationDrawer.subtitle')}
                        </Text>
                    </Stack>
                </Group>
            }
        >
            <Stack gap="lg">
                {summary.externalTable && (
                    <Callout
                        variant="info"
                        title={t(
                            'preAggregateMaterializations.customerManaged',
                        )}
                    >
                        <Text fz="xs">
                            {t(
                                'materializationDrawer.customerManagedDescription',
                            )}
                        </Text>
                    </Callout>
                )}

                {summary.externalTable && (
                    <Box>
                        <DetailLabel>
                            {t('materializationDrawer.externalTable')}
                        </DetailLabel>
                        <DetailValue mono>{summary.externalTable}</DetailValue>
                    </Box>
                )}

                <Box>
                    <DetailLabel>
                        {t(
                            'preAggregateMaterializations.columns.sourceExplore',
                        )}
                    </DetailLabel>
                    <DetailValue mono>{summary.sourceExploreName}</DetailValue>
                </Box>

                {summary.materializationRole && (
                    <MaterializationRoleSection
                        materializationRole={summary.materializationRole}
                    />
                )}

                <Box>
                    <DetailLabel>
                        {t('materializationDrawer.metrics')}
                    </DetailLabel>
                    <Group gap="xs" mt={4}>
                        {summary.metrics.map((m) => (
                            <Badge
                                key={m}
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
                    <DetailLabel>
                        {t('materializationDrawer.dimensions')}
                    </DetailLabel>
                    <Group gap="xs" mt={4}>
                        {summary.dimensions.map((d) => (
                            <Badge
                                key={d}
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

                {summary.filters.length > 0 && (
                    <FiltersSection filters={summary.filters} />
                )}

                {summary.timeDimension && (
                    <Group gap="xl">
                        <Box>
                            <DetailLabel>
                                {t('materializationDrawer.timeDimension')}
                            </DetailLabel>
                            <DetailValue mono>
                                {summary.timeDimension}
                            </DetailValue>
                        </Box>
                        {summary.granularity && (
                            <Box>
                                <DetailLabel>
                                    {t('materializationDrawer.granularity')}
                                </DetailLabel>
                                <DetailValue mono>
                                    {summary.granularity}
                                </DetailValue>
                            </Box>
                        )}
                    </Group>
                )}

                {!summary.externalTable && summary.refreshCron && (
                    <Box>
                        <DetailLabel>
                            {t(
                                'preAggregateMaterializations.columns.refreshSchedule',
                            )}
                        </DetailLabel>
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
                        <DetailLabel>
                            {t('preAggregateMaterializations.definitionError')}
                        </DetailLabel>
                        <Text fz="sm" c="red">
                            {summary.definitionError}
                        </Text>
                    </Box>
                )}

                {summary.warnings.length > 0 && (
                    <Box>
                        <DetailLabel>
                            {t('materializationDrawer.warnings')}
                        </DetailLabel>
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
                                        {t(
                                            'materializationDrawer.lastMaterialization',
                                        )}
                                    </Text>
                                </Group>
                                <Tooltip
                                    label={t(
                                        'preAggregateMaterializations.rebuildOne',
                                    )}
                                >
                                    <ActionIcon
                                        size="sm"
                                        loading={isRefreshing}
                                        onClick={() =>
                                            onRefresh(summary.preAggregateName)
                                        }
                                    >
                                        <MantineIcon
                                            icon={IconRefreshDot}
                                            size="sm"
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                            <Stack gap="xs">
                                <Group gap={4}>
                                    <MantineIcon
                                        icon={IconCalendarClock}
                                        color="dimmed"
                                    />
                                    <Text size="sm" c="dimmed">
                                        {t('materializationDrawer.trigger', {
                                            trigger: KNOWN_TRIGGERS.includes(
                                                materialization.trigger,
                                            )
                                                ? t(
                                                      `materializationDrawer.triggers.${materialization.trigger}`,
                                                  )
                                                : materialization.trigger,
                                        })}
                                    </Text>
                                </Group>

                                {materialization.materializedAt && (
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconClock}
                                            color="dimmed"
                                        />
                                        <Text size="sm" c="dimmed">
                                            {t(
                                                'materializationDrawer.materializedAt',
                                                {
                                                    date: new Date(
                                                        materialization.materializedAt,
                                                    ).toLocaleString(),
                                                },
                                            )}
                                        </Text>
                                    </Group>
                                )}

                                {materialization.rowCount != null && (
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconTableRow}
                                            color="dimmed"
                                        />
                                        <Text size="sm" c="dimmed">
                                            {t('materializationDrawer.rows', {
                                                rows: materialization.rowCount.toLocaleString(),
                                            })}
                                        </Text>
                                    </Group>
                                )}

                                {materialization.totalBytes != null && (
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconFile}
                                            color="dimmed"
                                        />
                                        <Text size="sm" c="dimmed">
                                            {t(
                                                'materializationDrawer.fileSize',
                                                {
                                                    size: formatFileSize(
                                                        materialization.totalBytes,
                                                    ),
                                                },
                                            )}
                                        </Text>
                                    </Group>
                                )}

                                {materialization.durationMs != null && (
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconHourglass}
                                            color="dimmed"
                                        />
                                        <Text size="sm" c="dimmed">
                                            {t(
                                                'materializationDrawer.buildTime',
                                                {
                                                    duration: formatDuration(
                                                        materialization.durationMs,
                                                    ),
                                                },
                                            )}
                                        </Text>
                                    </Group>
                                )}

                                {materialization.errorMessage && (
                                    <Box>
                                        <DetailLabel>
                                            {t('materializationDrawer.error')}
                                        </DetailLabel>
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
