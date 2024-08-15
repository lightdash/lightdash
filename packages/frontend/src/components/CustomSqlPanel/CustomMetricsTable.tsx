import {
    ActionIcon,
    Anchor,
    Checkbox,
    Collapse,
    Group,
    Stack,
    Table,
    Text,
} from '@mantine/core';
// import { Prism } from '@mantine/prism';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import MantineIcon from '../common/MantineIcon';

export type CustomMetricData = {
    name: string;
    label: string;
    modelName: string;
    yml: string;
    chartLabel: string;
    chartUrl: string;
};

type Column = {
    id: string;
    label?: string | React.ReactNode;
    cell: (data: CustomMetricData) => React.ReactNode;
    meta?: {
        style: React.CSSProperties;
    };
};

interface Props {
    customMetrics: CustomMetricData[];
    onSelectedCustomMetricsChange: (customMetrics: string[]) => void;
}

const CustomMetricsTable: FC<Props> = ({
    customMetrics,
    onSelectedCustomMetricsChange,
}) => {
    const { classes } = useTableStyles();
    const [openedUuids, setOpenedUuids] = useState<Set<string>>(new Set());
    const toggleOpenUuid = useCallback(
        (uuid: string) => {
            if (openedUuids.has(uuid)) {
                openedUuids.delete(uuid);
            } else {
                openedUuids.add(uuid);
            }
            setOpenedUuids(new Set(openedUuids));
        },
        [openedUuids],
    );
    const [checkedUuids, setCheckedUuids] = useState<Set<string>>(new Set());
    const toggleCheckedUuid = useCallback(
        (uuid: string) => {
            if (checkedUuids.has(uuid)) {
                checkedUuids.delete(uuid);
            } else {
                checkedUuids.add(uuid);
            }
            setCheckedUuids(new Set(checkedUuids));
        },
        [checkedUuids],
    );
    const toggleAllCheckedUuids = useCallback(() => {
        if (checkedUuids.size === customMetrics.length) {
            setCheckedUuids(new Set());
        } else {
            setCheckedUuids(
                new Set(customMetrics.map((metric) => metric.name)),
            );
        }
    }, [checkedUuids, customMetrics]);

    useEffect(() => {
        onSelectedCustomMetricsChange(Array.from(checkedUuids));
    }, [checkedUuids, onSelectedCustomMetricsChange]);

    const columns = useMemo<Column[]>(() => {
        return [
            {
                id: 'selected',
                label: (
                    <Checkbox
                        h={26}
                        checked={checkedUuids.size === customMetrics.length}
                        onChange={() => toggleAllCheckedUuids()}
                    />
                ),
                cell: (data) => {
                    return (
                        <Checkbox
                            h={26}
                            checked={checkedUuids.has(data.name)}
                            onChange={() => toggleCheckedUuid(data.name)}
                        />
                    );
                },
                meta: {
                    style: {
                        width: 30,
                    },
                },
            },
            {
                id: 'name',
                label: 'Name',
                cell: (data) => {
                    return <Text>{data.label}</Text>;
                },
                meta: {
                    style: {
                        width: 250,
                    },
                },
            },
            {
                id: 'modelName',
                label: 'Model',
                cell: (data) => {
                    return (
                        <Text fz="xs" color="gray.6">
                            {data.modelName}
                        </Text>
                    );
                },
            },
            {
                id: 'chartLabel',
                label: 'Chart',
                cell: (data) => {
                    return (
                        <Text fz="xs" color="gray.6">
                            <Anchor
                                role="button"
                                href={data.chartUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {data.chartLabel}
                            </Anchor>
                        </Text>
                    );
                },
            },
            {
                id: 'yml',
                label: 'YML',
                cell: (data) => {
                    const isOpen = openedUuids.has(data.name);
                    return (
                        <Stack spacing="md" fz="xs" fw={500}>
                            <Group spacing="two">
                                <Text>See YML</Text>
                                <ActionIcon
                                    onClick={() => toggleOpenUuid(data.name)}
                                    size="sm"
                                >
                                    <MantineIcon
                                        icon={
                                            isOpen
                                                ? IconChevronUp
                                                : IconChevronDown
                                        }
                                        color="black"
                                        size={13}
                                    />
                                </ActionIcon>
                            </Group>
                            <Collapse in={isOpen}>
                                <Stack spacing="md">
                                    {/* <Prism ta="left" language="yaml">
                                        {data.yml}
                                    </Prism> */}
                                </Stack>
                            </Collapse>
                        </Stack>
                    );
                },
                meta: {
                    style: {
                        width: 250,
                    },
                },
            },
        ];
    }, [
        toggleAllCheckedUuids,
        checkedUuids,
        toggleCheckedUuid,
        toggleOpenUuid,
        openedUuids,
        customMetrics,
    ]);

    return (
        <Table className={classes.root} highlightOnHover>
            <thead>
                <tr>
                    {columns.map((column) => {
                        return (
                            <th key={column.id} style={column?.meta?.style}>
                                {column?.label}
                            </th>
                        );
                    })}
                </tr>
            </thead>

            <tbody>
                {customMetrics.map((customMetric) => (
                    <tr key={customMetric.name}>
                        {columns.map((column) => (
                            <td key={column.id}>{column.cell(customMetric)}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </Table>
    );
};

export default CustomMetricsTable;
