import { Button, Colors } from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import {
    friendlyName,
    isExploreError,
    LineageNodeDependency,
} from '@lightdash/common';
import * as dagre from 'dagre';
import EChartsReact from 'echarts-for-react';
import { useState } from 'react';
import { useExplore } from '../hooks/useExplore';
import { useExplorer } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';

const Content = () => {
    const [showAll, setShowAll] = useState(false);
    const {
        state: {
            unsavedChartVersion: { tableName },
        },
    } = useExplorer();
    const currentExplore = useExplore(tableName);
    if (currentExplore.status !== 'success') return null;
    if (isExploreError(currentExplore.data)) return null;
    const table = currentExplore.data.tables[currentExplore.data.baseTable];

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
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

export const LineageButton = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { track } = useTracking();
    return (
        <Popover2
            content={<Content />}
            interactionKind="click"
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="right"
            lazy
            fill
        >
            <Tooltip2 content="View this table's upstream and downstream dependencies.">
                <Button
                    minimal
                    icon="data-lineage"
                    text="Show lineage"
                    onClick={() => {
                        track({
                            name: EventName.SHOW_LINEAGE_BUTTON_CLICKED,
                        });
                    }}
                />
            </Tooltip2>
        </Popover2>
    );
};
