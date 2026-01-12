数据血缘系统 (Lineage Pro) 开发文档
1. 项目环境配置
为了实现与原图一致的 UI 效果，请确保安装以下依赖包：

Bash

# 安装核心引擎
npm install @xyflow/react @mantine/core @mantine/hooks @tabler/icons-react
# 安装布局与导出工具
npm install dagre html-to-image
2. 核心样式表 (index.css)
这是还原“琥珀橙”质感和“字段级连线”的关键 CSS。

CSS

/* 基础画布背景 */
.react-flow__background {
  background-color: #f8fafc;
}

/* 连线路径：增加圆角感与平滑过渡 */
.react-flow__edge-path {
  stroke-dasharray: 0;
  transition: stroke-width 0.3s, stroke 0.3s;
}

/* 字段高亮状态：左侧橙色边线与琥珀背景 */
.field-active-row {
  border-left: 3px solid #F59E0B !important;
  background-color: #FFF9DB !important; /* 琥珀橙浅背景 */
  transition: all 0.2s ease;
}

/* 自定义连接点：默认隐藏，激活时显示为实心圆点 */
.react-flow__handle-custom {
  width: 6px !important;
  height: 6px !important;
  background: transparent !important;
  border: none !important;
}

.field-active-row .react-flow__handle-custom {
  background: #F59E0B !important;
  border: 1px solid white !important;
}

/* 节点阴影还原图片中的悬浮感 */
.lineage-node-paper {
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05) !important;
}
3. 完整业务代码 (App.tsx)
采用 @xyflow/react + Mantine 实现。包含了递归高亮算法和字段映射逻辑。

TypeScript



import React, { useState, useMemo, useCallback } from 'react';
import { 
  ReactFlow, Background, Handle, Position, useNodesState, 
  useEdgesState, MarkerType, ConnectionLineType, NodeProps, Edge, Node,
  getSmoothStepPath, BaseEdge, EdgeLabelRenderer
} from '@xyflow/react';
import { 
  Box, Text, Paper, Group, Stack, Badge, MantineProvider, 
  ActionIcon, Popover, Code, Divider, Drawer, Alert, ScrollArea
} from '@mantine/core';
import { IconSettings, IconAlertTriangle, IconChartBar, IconVariable } from '@tabler/icons-react';

// --- 1. 递归溯源算法 ---
const findLineage = (id: string, edges: Edge[]) => {
  const eIds = new Set<string>();
  const fIds = new Set<string>([id]);
  const trace = (curr: string, dir: 'src' | 'tgt') => {
    edges.forEach(e => {
      const match = dir === 'src' ? e.sourceHandle?.startsWith(curr) : e.targetHandle?.startsWith(curr);
      if (match) {
        eIds.add(e.id);
        const next = dir === 'src' ? e.targetHandle?.split('-')[0] : e.sourceHandle?.split('-')[0];
        if (next && !fIds.has(next)) { fIds.add(next); trace(next, dir); }
      }
    });
  };
  trace(id, 'src'); trace(id, 'tgt');
  return { eIds, fIds };
};
// --- 2. 嵌套逻辑树组件 (AND/OR) ---
const ConditionTree = ({ data, level = 0 }: any) => {
  if (!data.type) return (
    <Text size="10px" pl={level * 16} py={2} c="dimmed">
      • {data.field} <Text component="span" c="blue.6" fw={700}>{data.op}</Text> {data.value}
    </Text>
  );
  return (
    <Box ml={level * 8} style={{ borderLeft: `2px solid ${data.type === 'and' ? '#228be6' : '#fab005'}`, paddingLeft: 8 }}>
      <Badge size="xs" color={data.type === 'and' ? 'blue' : 'yellow'} radius="xs" mb={4}>
        {data.type.toUpperCase()}
      </Badge>
      {data.children.map((child: any, i: number) => <ConditionTree key={i} data={child} level={level + 1} />)}
    </Box>
  );
};

// --- 3. 自定义节点 (物理表) ---
const TableNode = ({ data }: NodeProps) => (
  <Paper radius="sm" withBorder className="lineage-paper" style={{ minWidth: 260, overflow: 'hidden' }}>
    <Box p="xs" bg={data.color} c="white">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Text size="xs" fw={700}>{data.tableName}</Text>
          <Text size="10px" opacity={0.8}>{data.dbPath}</Text>
        </Stack>
        {data.status === 'CHANGED' && <IconAlertTriangle size={16} color="#ffec99" />}
      </Group>
    </Box>
    <Stack gap={0} py={4}>
      {data.fields.map((f: any) => {
        const isActive = data.highlightedFields.has(f.id);
        return (
          <Box key={f.id} px="md" py={7} pos="relative" className={isActive ? 'field-active' : ''}
               onClick={() => data.onSelect(f.id)} style={{ backgroundColor: isActive ? '#FFF9DB' : 'transparent', cursor: 'pointer' }}>
            <Handle type="target" position={Position.Left} id={`${f.id}-tgt`} />
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs">
                <Text size="10px" c="gray.4" ff="monospace" w={12}>{f.index}</Text>
                <Text size="xs" fw={isActive ? 700 : 400} c={isActive ? 'orange.9' : 'gray.7'}>{f.name}</Text>
              </Group>
              <Text size="10px" c="dimmed">{f.alias}</Text>
            </Group>
            <Handle type="source" position={Position.Right} id={`${f.id}-src`} />
          </Box>
        );
      })}
    </Stack>
  </Paper>
);

// --- 4. 自定义节点 (指标) ---
const MetricNode = ({ data }: NodeProps) => (
  <Popover position="top" withArrow shadow="md">
    <Popover.Target>
      <Paper radius="sm" p="xs" withBorder style={{ border: `1px solid #F59E0B`, cursor: 'pointer', background: '#FFFBEB' }}
             onClick={() => data.onSelect(data.id)}>
        <Handle type="target" position={Position.Left} id={`${data.id}-tgt`} />
        <Group gap="xs">
          <IconChartBar size={16} color="#F59E0B" />
          <Stack gap={0}>
            <Text size="xs" fw={700}>{data.label}</Text>
            <Text size="10px" c="dimmed">{data.isDerived ? '复合指标' : '原子指标'}</Text>
          </Stack>
        </Group>
        <Handle type="source" position={Position.Right} id={`${data.id}-src`} />
      </Paper>
    </Popover.Target>
    <Popover.Dropdown p="sm">
      <Stack gap="xs">
        <Text size="xs" fw={700}>计算公式</Text>
        <Code block color="orange.0">{data.formula}</Code>
        {data.filters && (
          <>
            <Divider />
            <Text size="xs" fw={700}>筛选嵌套逻辑 (AND/OR)</Text>
            <ConditionTree data={data.filters} />
          </>
        )}
      </Stack>
    </Popover.Dropdown>
  </Popover>
);

// --- 5. 完整 Mock 数据 ---
const INITIAL_NODES: Node[] = [
  { id: 'n1', type: 'tableNode', position: { x: 0, y: 100 }, data: { tableName: 'ODS_ORDER', dbPath: 'pg.ods', color: '#10b981', status: 'CHANGED', fields: [{ id: 'f1', index: 1, name: 'raw_amt', alias: '原始金额' }] } },
  { id: 'n2', type: 'tableNode', position: { x: 400, y: 50 }, data: { tableName: 'DWD_ORDER', dbPath: 'pg.dwd', color: '#3b82f6', fields: [{ id: 'f2', index: 1, name: 'order_amt', alias: '订单金额' }] } },
  { id: 'm1', type: 'metricNode', position: { x: 800, y: 80 }, data: { label: '月营收指数', formula: 'sum(order_amt) * 0.9', isDerived: true, filters: {
    type: 'and', children: [
      { field: 'status', op: '==', value: 'SUCCESS' },
      { type: 'or', children: [ { field: 'region', op: '==', value: 'CN' }, { field: 'is_vip', op: '==', value: 'true' } ] }
    ]
  } } }
];

const INITIAL_EDGES: Edge[] = [
  { id: 'e1', source: 'n1', sourceHandle: 'f1-src', target: 'n2', targetHandle: 'f2-tgt', animated: true },
  { id: 'e2', source: 'n2', sourceHandle: 'f2-src', target: 'm1', targetHandle: 'm1-tgt' }
];

// --- 6. 主画布 ---
export default function LineageEnterpriseApp() {
  const [nodes, setNodes] = useNodesState(INITIAL_NODES);
  const [edges, setEdges] = useEdgesState(INITIAL_EDGES);
  const [active, setActive] = useState({ eIds: new Set<string>(), fIds: new Set<string>() });

  const onSelect = useCallback((id: string) => {
    setActive(findLineage(id, edges));
  }, [edges]);

  const styledNodes = useMemo(() => nodes.map(n => ({
    ...n, data: { ...n.data, highlightedFields: active.fIds, onSelect }
  })), [nodes, active, onSelect]);

  const styledEdges = useMemo(() => edges.map(e => ({
    ...e,
    type: ConnectionLineType.SmoothStep,
    animated: active.eIds.has(e.id),
    style: { stroke: active.eIds.has(e.id) ? '#F59E0B' : '#CBD5E1', strokeWidth: active.eIds.has(e.id) ? 3 : 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: active.eIds.has(e.id) ? '#F59E0B' : '#CBD5E1' }
  })), [edges, active]);

  return (
    <MantineProvider>
      <div style={{ width: '100vw', height: '100vh', background: '#F8FAFC' }}>
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          nodeTypes={{ tableNode: TableNode, metricNode: MetricNode }}
          fitView
        >
          <Background color="#E2E8F0" gap={20} />
        </ReactFlow>
      </div>
    </MantineProvider>
  );
}


import React, { useState, useMemo, useCallback } from 'react';
import { 
  ReactFlow, Background, Handle, Position, useNodesState, 
  useEdgesState, MarkerType, ConnectionLineType, NodeProps, Node, Edge, Panel 
} from '@xyflow/react';
import { 
  Box, Text, Paper, Group, Stack, Badge, MantineProvider, 
  createTheme, Avatar
} from '@mantine/core';
import '@xyflow/react/dist/style.css';

// 琥珀橙主色值
const AMBER = '#F59E0B';

// --- A. 递归算法：实现全链路溯源高亮 ---
const findDeepLineage = (fieldId: string, edges: Edge[]) => {
  const eIds = new Set<string>();
  const fIds = new Set<string>([fieldId]);

  const trace = (curr: string, dir: 'up' | 'down') => {
    edges.forEach(e => {
      const match = dir === 'down' ? e.sourceHandle?.startsWith(curr) : e.targetHandle?.startsWith(curr);
      if (match) {
        eIds.add(e.id);
        const next = dir === 'down' ? e.targetHandle?.split('-')[0] : e.sourceHandle?.split('-')[0];
        if (next && !fIds.has(next)) {
          fIds.add(next);
          trace(next, dir);
        }
      }
    });
  };
  trace(fieldId, 'up');
  trace(fieldId, 'down');
  return { eIds, fIds };
};

// --- B. 自定义节点组件：100% 还原图片样式 ---
const LineageNode = ({ data }: NodeProps) => {
  return (
    <Paper radius="sm" withBorder className="lineage-node-paper" style={{ minWidth: 260, overflow: 'hidden' }}>
      {/* 顶部彩色 Header */}
      <Box p="xs" style={{ background: data.color || '#228be6', color: 'white' }}>
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={0}>
            <Text size="xs" fw={700}>{data.tableName}</Text>
            <Text size="10px" opacity={0.8}>{data.dbPath}</Text>
          </Stack>
          {data.isMain && <Badge color="orange" variant="filled" size="xs">起始资产</Badge>}
        </Group>
      </Box>

      {/* 字段列表 */}
      <Stack gap={0} py={4}>
        {data.fields.map((f: any) => {
          const isActive = data.highlightedFields.has(f.id);
          return (
            <Box 
              key={f.id} px="md" py={7} pos="relative"
              className={isActive ? 'field-active-row' : ''}
              onClick={(e) => { e.stopPropagation(); data.onSelect(f.id); }}
              style={{ cursor: 'pointer' }}
            >
              <Handle type="target" position={Position.Left} id={`${f.id}-tgt`} className="react-flow__handle-custom" />
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs">
                  <Text size="10px" c="gray.4" w={12} ff="monospace">{f.index}</Text>
                  <Text size="xs" fw={isActive ? 700 : 400} c={isActive ? 'orange.9' : 'gray.7'}>{f.name}</Text>
                </Group>
                <Group gap={4}>
                  {f.tag && <Badge color="orange" variant="light" size="10px" radius="xs" px={4}>{f.tag}</Badge>}
                  <Text size="10px" c={isActive ? 'orange.5' : 'gray.5'}>{f.alias}</Text>
                </Group>
              </Group>
              <Handle type="source" position={Position.Right} id={`${f.id}-src`} className="react-flow__handle-custom" />
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
};

// --- C. Mock 数据 ---
const INITIAL_NODES: Node[] = [
  { id: 'n1', type: 'lineageNode', position: { x: 50, y: 150 }, data: { tableName: 'ODS_p_order_mrsk', dbPath: 'pg_ods.order', color: '#10b981', fields: [{id: 'f1', index: 6, name: 'Last_Month_Rank', alias: '上月交易总排名'}] } },
  { id: 'n2', type: 'lineageNode', position: { x: 450, y: 100 }, data: { isMain: true, tableName: 'DWD_PHWM_ABT_UID', dbPath: 'aloud_insurance_demo', color: '#3b82f6', fields: [{id: 'f2', index: 5, name: 'Last_Month_Rank', alias: '上月交易总排名', tag: '存在冗余字段'}] } },
  { id: 'n3', type: 'lineageNode', position: { x: 850, y: 150 }, data: { tableName: 'AAML_Account Balance Ranking', dbPath: 'aloud_insurance_demo', color: '#0ea5e9', fields: [{id: 'f3', index: 4, name: 'Last_Month_Rank', alias: '上月交易总排名'}] } }
];

const INITIAL_EDGES: Edge[] = [
  { id: 'e1', source: 'n1', sourceHandle: 'f1-src', target: 'n2', targetHandle: 'f2-tgt' },
  { id: 'e2', source: 'n2', sourceHandle: 'f2-src', target: 'n3', targetHandle: 'f3-tgt' }
];

// --- D. 主程序 ---
export default function LineageApp() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [active, setActive] = useState({ eIds: new Set<string>(), fIds: new Set<string>() });

  const onSelect = useCallback((fid: string) => {
    setActive(findDeepLineage(fid, edges));
  }, [edges]);

  const styledEdges = useMemo(() => edges.map(e => ({
    ...e,
    type: ConnectionLineType.SmoothStep,
    animated: active.eIds.has(e.id),
    style: { stroke: active.eIds.has(e.id) ? AMBER : '#CBD5E1', strokeWidth: active.eIds.has(e.id) ? 3 : 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: active.eIds.has(e.id) ? AMBER : '#CBD5E1' },
    pathOptions: { borderRadius: 20 }
  })), [edges, active]);

  const styledNodes = useMemo(() => nodes.map(n => ({
    ...n,
    data: { ...n.data, highlightedFields: active.fIds, onSelect }
  })), [nodes, active, onSelect]);

  return (
    <MantineProvider>
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          nodeTypes={{ lineageNode: LineageNode }}
          onPaneClick={() => setActive({ eIds: new Set(), fIds: new Set() })}
          fitView
        >
          <Panel position="top-left" style={{ margin: 20 }}>
             <Stack gap="xs">
               <Avatar radius="xs" src="oracle-logo-url" />
               <Avatar radius="xs" src="pg-logo-url" />
             </Stack>
          </Panel>
          <Background color="#f1f3f5" gap={24} />
        </ReactFlow>
      </div>
    </MantineProvider>
  );
}