import {
    DimensionType,
    FieldType,
    MetricType,
    type Field,
    type LiveSourceField,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Code,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { type ContentTableColumnDef } from '../../../common/ContentTable';
import FieldIcon from '../../../common/Filters/FieldIcon';
import MantineIcon from '../../../common/MantineIcon';
import { formatChartCount, formatFieldType } from './liveSourceFieldsView';

const isDimensionType = (type: string): type is DimensionType =>
    Object.values<string>(DimensionType).includes(type);

const isMetricType = (type: string): type is MetricType =>
    Object.values<string>(MetricType).includes(type);

// FieldIcon only reads the field type and its dimension or metric type
const toIconItem = (field: LiveSourceField) =>
    ({
        fieldType:
            field.kind === 'metric' ? FieldType.METRIC : FieldType.DIMENSION,
        type:
            field.kind === 'metric'
                ? isMetricType(field.type)
                    ? field.type
                    : MetricType.NUMBER
                : isDimensionType(field.type)
                  ? field.type
                  : DimensionType.STRING,
        name: field.name,
        label: field.label,
    }) as Field;

type Handlers = {
    onEdit: (field: LiveSourceField) => void;
    onUse: (field: LiveSourceField) => void;
    usingFieldName: string | null;
};

export const getFieldsColumns = ({
    onEdit,
    onUse,
    usingFieldName,
}: Handlers): ContentTableColumnDef<LiveSourceField>[] => [
    {
        accessorKey: 'label',
        header: 'Field',
        enableSorting: true,
        size: 270,
        Cell: ({ row }) => (
            <Group gap="sm" wrap="nowrap" align="center">
                <Box flex="none" display="flex">
                    <FieldIcon item={toIconItem(row.original)} />
                </Box>
                <Stack gap={2} miw={0}>
                    <Text fz="sm" fw={500} truncate>
                        {row.original.label}
                    </Text>
                    <Text fz="xs" c="dimmed" lineClamp={1}>
                        {row.original.description}
                    </Text>
                </Stack>
            </Group>
        ),
    },
    {
        id: 'type',
        accessorFn: (field) => field.type,
        header: 'Type',
        enableSorting: true,
        size: 110,
        Cell: ({ row }) => (
            <Text fz="sm" c="dimmed">
                {formatFieldType(row.original)}
            </Text>
        ),
    },
    {
        accessorKey: 'apiName',
        header: 'Source',
        enableSorting: true,
        size: 190,
        Cell: ({ row }) => (
            <Text component="div" truncate title={row.original.apiName}>
                <Code>{row.original.apiName}</Code>
            </Text>
        ),
    },
    {
        id: 'status',
        accessorFn: (field) => (field.inUse ? 0 : 1),
        header: 'Status',
        enableSorting: true,
        size: 120,
        Cell: ({ row }) =>
            row.original.inUse ? (
                <Badge variant="light" color="green" radius="sm" tt="none">
                    In use
                </Badge>
            ) : (
                <Badge variant="outline" color="gray" radius="sm" tt="none">
                    Not in use
                </Badge>
            ),
    },
    {
        accessorKey: 'usedByChartCount',
        header: 'Used by',
        enableSorting: true,
        size: 110,
        Cell: ({ row }) =>
            row.original.inUse ? (
                <Text
                    fz="sm"
                    c={row.original.usedByChartCount > 0 ? undefined : 'dimmed'}
                    truncate
                >
                    {formatChartCount(row.original.usedByChartCount)}
                </Text>
            ) : (
                <Text fz="sm" c="dimmed">
                    —
                </Text>
            ),
    },
    {
        id: 'actions',
        header: '',
        enableSorting: false,
        size: 90,
        Cell: ({ row }) =>
            row.original.inUse ? (
                <Tooltip label="Edit field">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={`Edit ${row.original.label}`}
                        onClick={() => onEdit(row.original)}
                    >
                        <MantineIcon icon={IconPencil} />
                    </ActionIcon>
                </Tooltip>
            ) : (
                <Button
                    size="compact-xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    loading={usingFieldName === row.original.name}
                    disabled={
                        usingFieldName !== null &&
                        usingFieldName !== row.original.name
                    }
                    onClick={() => onUse(row.original)}
                >
                    Use
                </Button>
            ),
    },
];
