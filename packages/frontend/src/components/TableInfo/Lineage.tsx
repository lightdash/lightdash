import { Button, Colors } from '@blueprintjs/core';
import {
    friendlyName,
    isExploreError,
    LineageNodeDependency,
} from '@lightdash/common';
import * as dagre from 'dagre';
import EChartsReact from 'echarts-for-react';
import { FC, useState } from 'react';
import { useExplore } from '../../hooks/useExplore';

interface LineageProps {
    tableName: string;
}

const Lineage: FC<LineageProps> = ({ tableName }) => {
    const [showAll, setShowAll] = useState(false);
    const { data, isSuccess, isError } = useExplore(tableName);
    if (!isSuccess || !data) return null;
    if (isError || isExploreError(data)) return null;

    const table = data.tables[data.baseTable];

    const dag = new dagre.graphlib.Graph();
    dag.setGraph({
        nodesep: 10,
        ranksep: 10,
        align: 'UL',
        rankdir: 'BT',
    });
    dag.setDefaultEdgeLabel(() => ({}));
    const nodeHeight = 40;
    const getNodeWidth = (label: string) => label.length * 8 + 20;

    const addNode = (dep: LineageNodeDependency) => {
        const label = friendlyName(dep.name);
        dag.setNode(dep.name, {
            height: nodeHeight,
            width: getNodeWidth(label),
            label,
            type: dep.type,
        });
    };

    // Add all dependencies
    Object.entries(table.lineageGraph).forEach(([modelName, dependencies]) => {
        dependencies.forEach((dependency) => {
            if (
                showAll ||
                table.name === modelName ||
                table.name === dependency.name
            ) {
                addNode({ name: modelName, type: 'model' });
                addNode(dependency);
                dag.setEdge(modelName, dependency.name);
            }
        });
    });
    dagre.layout(dag);
    const height = dag.graph().height || 0;
    const width = dag.graph().width || 0;
    const nodes = dag.nodes().map((id) => ({
        symbol: 'circle',
        symbolSize: 20,
        name: dag.node(id).label,
        x: dag.node(id).x,
        y: dag.node(id).y,
        itemStyle: {
            color: id === table.name ? Colors.BLUE3 : Colors.GRAY1,
        },
    }));
    const edges = dag.edges().map((edge) => ({
        source: dag.node(edge.w).label,
        target: dag.node(edge.v).label,
    }));
    const options = {
        animationDurationUpdate: 1500,
        animationEasingUpdate: 'quinticInOut',
        grid: {
            containLabel: true,
            left: 0,
            right: 0,
        },
        series: [
            {
                type: 'graph',
                data: nodes,
                links: edges,
                lineStyle: {
                    width: 1.5,
                    curveness: 0.1,
                    color: Colors.GRAY3,
                    cap: 'round',
                    opacity: 1,
                },
                label: {
                    show: true,
                    position: 'left',
                },
                edgeSymbol: ['circle', 'arrow'],
                edgeSymbolSize: [0, 10],
                cursor: 'default',
                center: [(width - 50) / 2, height / 2],
                zoom: 0.9,
                silent: true,
            },
        ],
    };
    return (
        <div style={{ display: 'flex', padding: 5, flexDirection: 'column' }}>
            <EChartsReact
                style={{ width: width + 100, height }}
                option={options}
                notMerge
            />
            <div>
                <Button
                    icon={showAll ? 'zoom-out' : 'zoom-in'}
                    text={showAll ? 'Show direct dependencies' : 'Show all'}
                    minimal
                    onClick={() => setShowAll((x) => !x)}
                />
            </div>
        </div>
    );
};

export default Lineage;
