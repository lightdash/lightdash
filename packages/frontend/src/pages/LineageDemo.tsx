import {
    Avatar,
    Badge,
    Box,
    Code,
    Divider,
    Group,
    Paper,
    Popover,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertTriangle, IconChartBar } from '@tabler/icons-react';
import {
    Background,
    ConnectionLineType,
    Handle,
    MarkerType,
    Panel,
    Position,
    ReactFlow,
    useEdgesState,
    useNodesState,
    type Edge,
    type Node,
    type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState, type FC } from 'react';
import Page from '../components/common/Page/Page';
import classes from './LineageDemo.module.css';

const AMBER = '#f59e0b';

type LineageField = {
    id: string;
    index: number;
    name: string;
    alias: string;
    tag?: string;
};

type LineageCondition =
    | {
          type: 'and' | 'or';
          children: LineageCondition[];
      }
    | {
          field: string;
          op: string;
          value: string;
      };

type TableNodeData = {
    tableName: string;
    dbPath: string;
    color: string;
    fields: LineageField[];
    isMain?: boolean;
    status?: 'CHANGED' | 'OK';
    highlightedFields: Set<string>;
    onSelect: (fieldId: string) => void;
};

type MetricNodeData = {
    metricId: string;
    label: string;
    formula: string;
    isDerived?: boolean;
    filters?: LineageCondition;
    highlightedFields: Set<string>;
    onSelect: (fieldId: string) => void;
};

const findDeepLineage = (fieldId: string, edges: Edge[]) => {
    const eIds = new Set<string>();
    const fIds = new Set<string>([fieldId]);

    const trace = (current: string, direction: 'up' | 'down') => {
        edges.forEach((edge) => {
            const match =
                direction === 'down'
                    ? edge.sourceHandle?.startsWith(current)
                    : edge.targetHandle?.startsWith(current);
            if (!match) return;
            eIds.add(edge.id);
            const next =
                direction === 'down'
                    ? edge.targetHandle?.split('-')[0]
                    : edge.sourceHandle?.split('-')[0];
            if (next && !fIds.has(next)) {
                fIds.add(next);
                trace(next, direction);
            }
        });
    };

    trace(fieldId, 'up');
    trace(fieldId, 'down');

    return { eIds, fIds };
};

const ConditionTree: FC<{ data: LineageCondition; level?: number }> = ({
    data,
    level = 0,
}) => {
    if ('field' in data) {
        return (
            <Text size="xs" pl={level * 16} py={2} c="dimmed">
                • {data.field}{' '}
                <Text component="span" c="blue.6" fw={700}>
                    {data.op}
                </Text>{' '}
                {data.value}
            </Text>
        );
    }

    return (
        <Box
            ml={level * 8}
            style={{
                borderLeft: `2px solid ${
                    data.type === 'and' ? '#228be6' : '#fab005'
                }`,
                paddingLeft: 8,
            }}
        >
            <Badge
                size="xs"
                color={data.type === 'and' ? 'blue' : 'yellow'}
                radius="xs"
                mb={4}
            >
                {data.type.toUpperCase()}
            </Badge>
            {data.children.map((child, index) => (
                <ConditionTree
                    key={`${data.type}-${index}`}
                    data={child}
                    level={level + 1}
                />
            ))}
        </Box>
    );
};

const TableNode: FC<NodeProps<TableNodeData>> = ({ data }) => {
    return (
        <Paper
            radius="sm"
            withBorder
            className="lineage-node-paper"
            style={{ minWidth: 260, overflow: 'hidden' }}
        >
            <Box
                px="sm"
                py={6}
                style={{ background: data.color, color: '#fff' }}
            >
                <Group position="apart" spacing="xs" noWrap>
                    <Stack spacing={2}>
                        <Text size="xs" fw={700}>
                            {data.tableName}
                        </Text>
                        <Text fz={10} sx={{ opacity: 0.8 }}>
                            {data.dbPath}
                        </Text>
                    </Stack>
                    {data.status === 'CHANGED' ? (
                        <IconAlertTriangle size={16} color="#ffec99" />
                    ) : data.isMain ? (
                        <Badge color="orange" variant="filled" size="xs">
                            Start asset
                        </Badge>
                    ) : null}
                </Group>
            </Box>

            <Stack spacing={0} py={4}>
                {data.fields.map((field) => {
                    const isActive = data.highlightedFields.has(field.id);
                    return (
                        <Box
                            key={field.id}
                            px="md"
                            py={7}
                            pos="relative"
                            className={
                                isActive ? 'field-active-row' : undefined
                            }
                            onClick={(event) => {
                                event.stopPropagation();
                                data.onSelect(field.id);
                            }}
                            sx={{ cursor: 'pointer' }}
                        >
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={`${field.id}-tgt`}
                                className="react-flow__handle-custom"
                            />
                            <Group position="apart" spacing="xs" noWrap>
                                <Group spacing={6} noWrap>
                                    <Text
                                        fz={10}
                                        c="gray.4"
                                        ff="monospace"
                                        w={12}
                                    >
                                        {field.index}
                                    </Text>
                                    <Text
                                        size="xs"
                                        fw={isActive ? 700 : 400}
                                        c={isActive ? 'orange.9' : 'gray.7'}
                                    >
                                        {field.name}
                                    </Text>
                                </Group>
                                <Group spacing={4} noWrap>
                                    {field.tag ? (
                                        <Badge
                                            color="orange"
                                            variant="light"
                                            size="xs"
                                            radius="xs"
                                            px={4}
                                        >
                                            {field.tag}
                                        </Badge>
                                    ) : null}
                                    <Text
                                        fz={10}
                                        c={isActive ? 'orange.5' : 'gray.5'}
                                    >
                                        {field.alias}
                                    </Text>
                                </Group>
                            </Group>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`${field.id}-src`}
                                className="react-flow__handle-custom"
                            />
                        </Box>
                    );
                })}
            </Stack>
        </Paper>
    );
};

const MetricNode: FC<NodeProps<MetricNodeData>> = ({ id, data }) => {
    const isActive = data.highlightedFields.has(id);
    return (
        <Popover position="top" withArrow shadow="md">
            <Popover.Target>
                <Paper
                    radius="sm"
                    p="xs"
                    withBorder
                    style={{
                        border: `1px solid ${AMBER}`,
                        cursor: 'pointer',
                        background: isActive ? '#fff3bf' : '#fffbeb',
                    }}
                    onClick={() => data.onSelect(id)}
                >
                    <Handle
                        type="target"
                        position={Position.Left}
                        id={`${data.metricId}-tgt`}
                        className="react-flow__handle-custom"
                    />
                    <Group spacing="xs" noWrap>
                        <IconChartBar size={16} color={AMBER} />
                        <Stack spacing={0}>
                            <Text size="xs" fw={700}>
                                {data.label}
                            </Text>
                            <Text size={10} c="dimmed">
                                {data.isDerived ? '复合指标' : '原子指标'}
                            </Text>
                        </Stack>
                    </Group>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id={`${data.metricId}-src`}
                        className="react-flow__handle-custom"
                    />
                </Paper>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack spacing="xs">
                    <Text size="xs" fw={700}>
                        计算公式
                    </Text>
                    <Code block color="orange.0">
                        {data.formula}
                    </Code>
                    {data.filters ? (
                        <>
                            <Divider />
                            <Text size="xs" fw={700}>
                                筛选嵌套逻辑 (AND/OR)
                            </Text>
                            <ConditionTree data={data.filters} />
                        </>
                    ) : null}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

const INITIAL_NODES: Array<Node<TableNodeData | MetricNodeData>> = [
    {
        id: 'mdr_outpatient',
        type: 'tableNode',
        position: { x: -320, y: 60 },
        data: {
            tableName: 'mdr_outpatient',
            dbPath: 'models/dwd/mdr_outpatient.sql',
            color: '#14b8a6',
            status: 'CHANGED',
            fields: [
                {
                    id: 'mdr_outpatient.visitdttm',
                    index: 1,
                    name: 'visitdttm',
                    alias: '就诊时间',
                },
                {
                    id: 'mdr_outpatient.visitno',
                    index: 2,
                    name: 'visitno',
                    alias: '就诊号',
                },
                {
                    id: 'mdr_outpatient.visittype',
                    index: 3,
                    name: 'visittype',
                    alias: '就诊类型',
                },
                {
                    id: 'mdr_outpatient.visitclassname',
                    index: 4,
                    name: 'visitclassname',
                    alias: '就诊分类名称',
                },
                {
                    id: 'mdr_outpatient.medorgcode',
                    index: 5,
                    name: 'medorgcode',
                    alias: '机构编码',
                },
            ],
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'mdr_income',
        type: 'tableNode',
        position: { x: -320, y: 300 },
        data: {
            tableName: 'mdr_income',
            dbPath: 'models/dwd/mdr_income.sql',
            color: '#10b981',
            status: 'CHANGED',
            fields: [
                {
                    id: 'mdr_income.reportday',
                    index: 1,
                    name: 'reportday',
                    alias: '报表日期',
                },
                {
                    id: 'mdr_income.chargedttm',
                    index: 2,
                    name: 'chargedttm',
                    alias: '收费时间',
                },
                {
                    id: 'mdr_income.visitno',
                    index: 3,
                    name: 'visitno',
                    alias: '就诊号',
                },
                {
                    id: 'mdr_income.visittype',
                    index: 4,
                    name: 'visittype',
                    alias: '就诊类型',
                },
                {
                    id: 'mdr_income.medorgcode',
                    index: 5,
                    name: 'medorgcode',
                    alias: '机构编码',
                },
            ],
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'fact_mdr_income',
        type: 'tableNode',
        position: { x: 720, y: 220 },
        data: {
            tableName: 'fact_mdr_income',
            dbPath: 'models/dm/fact_mdr_income.sql',
            color: '#3b82f6',
            isMain: true,
            fields: [
                {
                    id: 'fact_mdr_income.report_day',
                    index: 1,
                    name: 'report_day',
                    alias: '报表日期',
                },
                {
                    id: 'fact_mdr_income.charge_date',
                    index: 2,
                    name: 'charge_date',
                    alias: '收费日期',
                },
                {
                    id: 'fact_mdr_income.visit_id',
                    index: 3,
                    name: 'visit_id',
                    alias: '就诊ID',
                },
                {
                    id: 'fact_mdr_income.visit_dept_id',
                    index: 4,
                    name: 'visit_dept_id',
                    alias: '就诊科室ID',
                },
                {
                    id: 'fact_mdr_income.visit_doct_id',
                    index: 5,
                    name: 'visit_doct_id',
                    alias: '就诊医生ID',
                },
                {
                    id: 'fact_mdr_income.admtype_id',
                    index: 6,
                    name: 'admtype_id',
                    alias: '就诊类型ID',
                },
                {
                    id: 'fact_mdr_income.taritem_id',
                    index: 7,
                    name: 'taritem_id',
                    alias: '收费项目ID',
                },
                {
                    id: 'fact_mdr_income.facttotalfee',
                    index: 8,
                    name: 'facttotalfee',
                    alias: '实收金额',
                },
                {
                    id: 'fact_mdr_income.quantity',
                    index: 9,
                    name: 'quantity',
                    alias: '收费数量',
                },
            ],
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'fact_mdr_outpatient',
        type: 'tableNode',
        position: { x: 720, y: 520 },
        data: {
            tableName: 'fact_mdr_outpatient',
            dbPath: 'models/dm/fact_mdr_outpatient.sql',
            color: '#3b82f6',
            fields: [
                {
                    id: 'fact_mdr_outpatient.report_day',
                    index: 1,
                    name: 'report_day',
                    alias: '报表日期',
                },
                {
                    id: 'fact_mdr_outpatient.visit_date',
                    index: 2,
                    name: 'visit_date',
                    alias: '就诊日期',
                },
                {
                    id: 'fact_mdr_outpatient.visitno',
                    index: 3,
                    name: 'visitno',
                    alias: '就诊号',
                },
                {
                    id: 'fact_mdr_outpatient.visittype',
                    index: 4,
                    name: 'visittype',
                    alias: '就诊类型',
                },
                {
                    id: 'fact_mdr_outpatient.visitclassname',
                    index: 5,
                    name: 'visitclassname',
                    alias: '就诊分类名称',
                },
                {
                    id: 'fact_mdr_outpatient.reg_dept_id',
                    index: 6,
                    name: 'reg_dept_id',
                    alias: '挂号科室ID',
                },
                {
                    id: 'fact_mdr_outpatient.reg_doct_id',
                    index: 7,
                    name: 'reg_doct_id',
                    alias: '挂号医生ID',
                },
                {
                    id: 'fact_mdr_outpatient.admtype_id',
                    index: 8,
                    name: 'admtype_id',
                    alias: '就诊类型ID',
                },
                {
                    id: 'fact_mdr_outpatient.medorgcode',
                    index: 9,
                    name: 'medorgcode',
                    alias: '机构编码',
                },
            ],
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'dim_department',
        type: 'tableNode',
        position: { x: 60, y: 20 },
        data: {
            tableName: 'dim_department',
            dbPath: 'models/dm/dim_department.sql',
            color: '#6366f1',
            fields: [
                {
                    id: 'dim_department.dept_id',
                    index: 1,
                    name: 'dept_id',
                    alias: '科室ID',
                },
                {
                    id: 'dim_department.dept_code',
                    index: 2,
                    name: 'dept_code',
                    alias: '科室编码',
                },
                {
                    id: 'dim_department.dept_name',
                    index: 3,
                    name: 'dept_name',
                    alias: '科室名称',
                },
                {
                    id: 'dim_department.area_name',
                    index: 4,
                    name: 'area_name',
                    alias: '院区名称',
                },
            ],
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'dim_doctor',
        type: 'tableNode',
        position: { x: 60, y: 200 },
        data: {
            tableName: 'dim_doctor',
            dbPath: 'models/dm/dim_doctor.sql',
            color: '#8b5cf6',
            fields: [
                {
                    id: 'dim_doctor.doct_id',
                    index: 1,
                    name: 'doct_id',
                    alias: '医生ID',
                },
                {
                    id: 'dim_doctor.doct_code',
                    index: 2,
                    name: 'doct_code',
                    alias: '医生编码',
                },
                {
                    id: 'dim_doctor.doct_name',
                    index: 3,
                    name: 'doct_name',
                    alias: '医生姓名',
                },
                {
                    id: 'dim_doctor.medorgname',
                    index: 4,
                    name: 'medorgname',
                    alias: '机构名称',
                },
            ],
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'dim_charge_item',
        type: 'tableNode',
        position: { x: 60, y: 420 },
        data: {
            tableName: 'dim_charge_item',
            dbPath: 'models/dm/dim_charge_item.sql',
            color: '#06b6d4',
            fields: [
                {
                    id: 'dim_charge_item.item_id',
                    index: 1,
                    name: 'item_id',
                    alias: '收费项目ID',
                },
                {
                    id: 'dim_charge_item.item_name',
                    index: 2,
                    name: 'item_name',
                    alias: '收费项目名称',
                },
                {
                    id: 'dim_charge_item.charge_major_category',
                    index: 3,
                    name: 'charge_major_category',
                    alias: '费用大类',
                },
                {
                    id: 'dim_charge_item.chargecategoryname',
                    index: 4,
                    name: 'chargecategoryname',
                    alias: '费用类别名称',
                },
            ],
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'dim_admtype',
        type: 'tableNode',
        position: { x: 60, y: 620 },
        data: {
            tableName: 'dim_admtype',
            dbPath: 'models/dm/dim_admtype.sql',
            color: '#0ea5e9',
            fields: [
                {
                    id: 'dim_admtype.admtype_id',
                    index: 1,
                    name: 'admtype_id',
                    alias: '就诊类型ID',
                },
                {
                    id: 'dim_admtype.admtype_code',
                    index: 2,
                    name: 'admtype_code',
                    alias: '就诊类型编码',
                },
                {
                    id: 'dim_admtype.admtype_name',
                    index: 3,
                    name: 'admtype_name',
                    alias: '就诊类型名称',
                },
                {
                    id: 'dim_admtype.medorgcode',
                    index: 4,
                    name: 'medorgcode',
                    alias: '机构编码',
                },
            ],
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'metric_total_income',
        type: 'metricNode',
        position: { x: 1120, y: 160 },
        data: {
            metricId: 'metric_total_income',
            label: '收入总额',
            formula: 'sum(facttotalfee)',
            isDerived: false,
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'metric_total_drug_income',
        type: 'metricNode',
        position: { x: 1120, y: 320 },
        data: {
            metricId: 'metric_total_drug_income',
            label: '药品收入',
            formula:
                "sum(facttotalfee) where charge_item.charge_major_category = '药品费用'",
            isDerived: false,
            filters: {
                field: 'charge_item.charge_major_category',
                op: '==',
                value: '药品费用',
            },
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'metric_drug_income_ratio',
        type: 'metricNode',
        position: { x: 1380, y: 240 },
        data: {
            metricId: 'metric_drug_income_ratio',
            label: '药占比',
            formula: 'total_drug_income / total_income',
            isDerived: true,
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'metric_outpatient_visit_count',
        type: 'metricNode',
        position: { x: 1120, y: 560 },
        data: {
            metricId: 'metric_outpatient_visit_count',
            label: '门诊人次',
            formula: 'visit_count',
            isDerived: true,
            filters: {
                field: 'admtype.admtype_name',
                op: '==',
                value: '门诊',
            },
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
    {
        id: 'metric_outpatient_avg_drug_cost',
        type: 'metricNode',
        position: { x: 1380, y: 520 },
        data: {
            metricId: 'metric_outpatient_avg_drug_cost',
            label: '门诊次均药品费用',
            formula: 'total_drug_income / outpatient_visit_count',
            isDerived: true,
            filters: {
                field: 'admtype.admtype_name',
                op: '==',
                value: '门诊',
            },
            highlightedFields: new Set(),
            onSelect: () => {},
        },
    },
];

const INITIAL_EDGES: Edge[] = [
    {
        id: 'e0',
        source: 'mdr_outpatient',
        sourceHandle: 'mdr_outpatient.visitdttm-src',
        target: 'fact_mdr_outpatient',
        targetHandle: 'fact_mdr_outpatient.visit_date-tgt',
    },
    {
        id: 'e0b',
        source: 'mdr_outpatient',
        sourceHandle: 'mdr_outpatient.visitno-src',
        target: 'fact_mdr_outpatient',
        targetHandle: 'fact_mdr_outpatient.visitno-tgt',
    },
    {
        id: 'e0c',
        source: 'mdr_outpatient',
        sourceHandle: 'mdr_outpatient.visittype-src',
        target: 'fact_mdr_outpatient',
        targetHandle: 'fact_mdr_outpatient.visittype-tgt',
    },
    {
        id: 'e0d',
        source: 'mdr_outpatient',
        sourceHandle: 'mdr_outpatient.visitclassname-src',
        target: 'fact_mdr_outpatient',
        targetHandle: 'fact_mdr_outpatient.visitclassname-tgt',
    },
    {
        id: 'e0e',
        source: 'mdr_outpatient',
        sourceHandle: 'mdr_outpatient.medorgcode-src',
        target: 'fact_mdr_outpatient',
        targetHandle: 'fact_mdr_outpatient.medorgcode-tgt',
    },
    {
        id: 'e1',
        source: 'mdr_income',
        sourceHandle: 'mdr_income.reportday-src',
        target: 'fact_mdr_income',
        targetHandle: 'fact_mdr_income.report_day-tgt',
    },
    {
        id: 'e2',
        source: 'mdr_income',
        sourceHandle: 'mdr_income.chargedttm-src',
        target: 'fact_mdr_income',
        targetHandle: 'fact_mdr_income.charge_date-tgt',
    },
    {
        id: 'e3',
        source: 'mdr_income',
        sourceHandle: 'mdr_income.visitno-src',
        target: 'fact_mdr_income',
        targetHandle: 'fact_mdr_income.visit_id-tgt',
    },
    {
        id: 'e4',
        source: 'mdr_income',
        sourceHandle: 'mdr_income.visittype-src',
        target: 'fact_mdr_income',
        targetHandle: 'fact_mdr_income.admtype_id-tgt',
    },
    {
        id: 'e5',
        source: 'dim_department',
        sourceHandle: 'dim_department.dept_id-src',
        target: 'fact_mdr_income',
        targetHandle: 'fact_mdr_income.visit_dept_id-tgt',
    },
    {
        id: 'e6',
        source: 'dim_doctor',
        sourceHandle: 'dim_doctor.doct_id-src',
        target: 'fact_mdr_income',
        targetHandle: 'fact_mdr_income.visit_doct_id-tgt',
    },
    {
        id: 'e7',
        source: 'dim_charge_item',
        sourceHandle: 'dim_charge_item.item_id-src',
        target: 'fact_mdr_income',
        targetHandle: 'fact_mdr_income.taritem_id-tgt',
    },
    {
        id: 'e8',
        source: 'dim_admtype',
        sourceHandle: 'dim_admtype.admtype_id-src',
        target: 'fact_mdr_income',
        targetHandle: 'fact_mdr_income.admtype_id-tgt',
    },
    {
        id: 'e9',
        source: 'fact_mdr_income',
        sourceHandle: 'fact_mdr_income.facttotalfee-src',
        target: 'metric_total_income',
        targetHandle: 'metric_total_income-tgt',
    },
    {
        id: 'e10',
        source: 'fact_mdr_income',
        sourceHandle: 'fact_mdr_income.facttotalfee-src',
        target: 'metric_total_drug_income',
        targetHandle: 'metric_total_drug_income-tgt',
    },
    {
        id: 'e11',
        source: 'metric_total_income',
        sourceHandle: 'metric_total_income-src',
        target: 'metric_drug_income_ratio',
        targetHandle: 'metric_drug_income_ratio-tgt',
    },
    {
        id: 'e12',
        source: 'metric_total_drug_income',
        sourceHandle: 'metric_total_drug_income-src',
        target: 'metric_drug_income_ratio',
        targetHandle: 'metric_drug_income_ratio-tgt',
    },
    {
        id: 'e13',
        source: 'dim_department',
        sourceHandle: 'dim_department.dept_id-src',
        target: 'fact_mdr_outpatient',
        targetHandle: 'fact_mdr_outpatient.reg_dept_id-tgt',
    },
    {
        id: 'e14',
        source: 'dim_doctor',
        sourceHandle: 'dim_doctor.doct_id-src',
        target: 'fact_mdr_outpatient',
        targetHandle: 'fact_mdr_outpatient.reg_doct_id-tgt',
    },
    {
        id: 'e15',
        source: 'dim_admtype',
        sourceHandle: 'dim_admtype.admtype_id-src',
        target: 'fact_mdr_outpatient',
        targetHandle: 'fact_mdr_outpatient.admtype_id-tgt',
    },
    {
        id: 'e16',
        source: 'fact_mdr_outpatient',
        sourceHandle: 'fact_mdr_outpatient.visitno-src',
        target: 'metric_outpatient_visit_count',
        targetHandle: 'metric_outpatient_visit_count-tgt',
    },
    {
        id: 'e17',
        source: 'metric_total_drug_income',
        sourceHandle: 'metric_total_drug_income-src',
        target: 'metric_outpatient_avg_drug_cost',
        targetHandle: 'metric_outpatient_avg_drug_cost-tgt',
    },
    {
        id: 'e18',
        source: 'metric_outpatient_visit_count',
        sourceHandle: 'metric_outpatient_visit_count-src',
        target: 'metric_outpatient_avg_drug_cost',
        targetHandle: 'metric_outpatient_avg_drug_cost-tgt',
    },
];

const LineageDemo: FC = () => {
    const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES);
    const [edges, , onEdgesChange] = useEdgesState(INITIAL_EDGES);
    const [active, setActive] = useState(() => ({
        eIds: new Set<string>(),
        fIds: new Set<string>(),
    }));

    const clearActive = useCallback(() => {
        setActive({
            eIds: new Set<string>(),
            fIds: new Set<string>(),
        });
    }, []);

    const handleSelect = useCallback(
        (fieldId: string) => {
            setActive(findDeepLineage(fieldId, edges));
        },
        [edges],
    );

    const styledEdges = useMemo(() => {
        return edges.map((edge) => {
            const isActive = active.eIds.has(edge.id);
            return {
                ...edge,
                type: ConnectionLineType.SmoothStep,
                animated: isActive,
                style: {
                    stroke: isActive ? AMBER : '#cbd5e1',
                    strokeWidth: isActive ? 3 : 1.5,
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: isActive ? AMBER : '#cbd5e1',
                },
                pathOptions: { borderRadius: 20 },
            };
        });
    }, [active.eIds, edges]);

    const styledNodes = useMemo(() => {
        return nodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                highlightedFields: active.fIds,
                onSelect: handleSelect,
            },
        }));
    }, [active.fIds, handleSelect, nodes]);

    return (
        <Page title="Lineage Demo" withFullHeight noContentPadding>
            <Stack spacing={0} h="100%">
                <Box px="lg" pt="lg" pb="sm">
                    <Group position="apart" align="center">
                        <Stack spacing={2}>
                            <Title order={3}>Lineage Pro Demo</Title>
                            <Text size="sm" c="ldGray.6">
                                Click a field to trace upstream and downstream
                                lineage.
                            </Text>
                        </Stack>
                        <Badge variant="light" color="orange">
                            Preview
                        </Badge>
                    </Group>
                </Box>
                <Box className={classes.canvas}>
                    <ReactFlow
                        className={classes.canvasInner}
                        nodes={styledNodes}
                        edges={styledEdges}
                        nodeTypes={{
                            tableNode: TableNode,
                            metricNode: MetricNode,
                        }}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onPaneClick={clearActive}
                        fitView
                    >
                        <Panel position="top-left" className={classes.panel}>
                            <Stack spacing="xs">
                                <Avatar radius="sm" size="sm" color="orange">
                                    OR
                                </Avatar>
                                <Avatar radius="sm" size="sm" color="teal">
                                    PG
                                </Avatar>
                            </Stack>
                        </Panel>
                        <Background color="#f1f3f5" gap={24} />
                    </ReactFlow>
                </Box>
            </Stack>
        </Page>
    );
};

export default LineageDemo;
