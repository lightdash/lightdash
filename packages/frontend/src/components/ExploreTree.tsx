import {FC, useCallback, useMemo, useState} from "react";
import {Dimension, Explore, FieldId, fieldId, friendlyName, Metric, Table} from "common";
import {Button, Classes, Colors, Icon, InputGroup, Intent, Tree, Dialog} from "@blueprintjs/core";
import {Tooltip2} from "@blueprintjs/popover2";
import Fuse from 'fuse.js';
import {TreeEventHandler} from "@blueprintjs/core/src/components/tree/tree";
import {TreeNodeInfo} from "@blueprintjs/core/src/components/tree/treeNode";

type NodeDataProps = {
    fieldId: FieldId,
    isDimension: boolean,
}

type ExploreTreeProps = {
    explore: Explore;
    onSelectedNodeChange: (fieldId: string, isDimension: boolean) => void;
    selectedNodes: Set<string>;
};

const ExploreTree: FC<ExploreTreeProps> = ({explore, selectedNodes, onSelectedNodeChange}) => {
    const [search, setSearch] = useState<string>('');

    return (
        <div style={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
            <div style={{padding: '0 15px 15px 10px'}}>
                <InputGroup
                    leftIcon={'search'}
                    rightElement={<Button minimal={true} icon={'cross'} onClick={() => setSearch('')}/>}
                    placeholder='Search metrics'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <div style={{overflowY: 'auto'}}>
                {Object.values(explore.tables).map(table => (
                    <TableTree
                        key={table.name}
                        search={search}
                        table={table}
                        joinSql={explore.joinedTables.find(joinTable => joinTable.table === table.name)?.sqlOn}
                        selectedNodes={selectedNodes}
                        onSelectedNodeChange={onSelectedNodeChange}
                    />
                ))}
            </div>
        </div>
    )
}

type TableTreeProps = {
    search: string;
    table: Table;
    joinSql?: string;
    selectedNodes: ExploreTreeProps['selectedNodes'];
    onSelectedNodeChange: ExploreTreeProps['onSelectedNodeChange'];
}

const TableTree: FC<TableTreeProps> = ({search, table, joinSql, selectedNodes, onSelectedNodeChange}) => {
    const [expanded, setExpanded] = useState<boolean>(true);
    const {metrics, dimensions} = table;

    const filteredMetrics: Metric[] = useMemo(() => {
        if (search !== '') {
            return new Fuse(Object.values(metrics), {keys: ['name', 'description']}).search(search).map(res => res.item)
        }
        return Object.values(metrics);
    }, [metrics, search]);

    const filteredDimensions: Dimension[] = useMemo(() => {
        if (search !== '') {
            return new Fuse(Object.values(dimensions), {keys: ['name', 'description']}).search(search).map(res => res.item)
        }
        return Object.values(dimensions);
    }, [dimensions, search]);

    const contents = [{
        key: table.name,
        id: table.name,
        label: friendlyName(table.name),
        isExpanded: expanded,
        secondaryLabel: (joinSql && <JoinDetailsButton joinSql={joinSql}/>),
        childNodes: [
            {
                key: "Metrics",
                id: "metrics",
                label: (<span style={{color: Colors.ORANGE1}}><strong>Metrics</strong></span>),
                icon: (
                    <Icon icon="numerical" intent={Intent.WARNING} className={Classes.TREE_NODE_ICON}/>
                ),
                isExpanded: true,
                hasCaret: false,
                childNodes: filteredMetrics.map(metric => ({
                    key: metric.name,
                    id: metric.name,
                    label: friendlyName(metric.name),
                    nodeData: {fieldId: fieldId(metric), isDimension: false} as NodeDataProps,
                    isSelected: selectedNodes.has(fieldId(metric)),
                    secondaryLabel: metric.description ? (
                        <Tooltip2 content={metric.description}>
                            <Icon icon="info-sign" iconSize={12}/>
                        </Tooltip2>
                    ) : null
                }))
            },
            {
                key: "dimensions",
                id: "dimensions",
                label: (<span style={{color: Colors.BLUE1}}><strong>Dimensions</strong></span>),
                icon: (
                    <Icon icon="tag" intent={Intent.PRIMARY} className={Classes.TREE_NODE_ICON}/>
                ),
                hasCaret: false,
                isExpanded: true,
                childNodes: filteredDimensions.map(dimension => ({
                    key: dimension.name,
                    id: dimension.name,
                    label: friendlyName(dimension.name),
                    nodeData: {fieldId: fieldId(dimension), isDimension: true} as NodeDataProps,
                    isSelected: selectedNodes.has(fieldId(dimension)),
                    secondaryLabel: dimension.description ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'flex-start',
                            alignItems: 'center'
                        }}>
                            <Tooltip2 content={dimension.description}>
                                <Icon icon="info-sign" iconSize={12}/>
                            </Tooltip2>
                        </div>
                    ) : null
                }))
            },
        ]
    }];

    const handleNodeClick: TreeEventHandler<NodeDataProps> = useCallback((nodeData: TreeNodeInfo<NodeDataProps>, _nodePath: number[]) => {
        if (_nodePath.length !== 1 && nodeData.nodeData) {
            onSelectedNodeChange(nodeData.nodeData.fieldId, nodeData.nodeData.isDimension);
        }
    }, [onSelectedNodeChange]);

    return (
        <Tree
            contents={contents}
            onNodeCollapse={() => setExpanded(false)}
            onNodeExpand={() => setExpanded(true)}
            onNodeClick={handleNodeClick}
        />
    )
}

const JoinDetailsButton: FC<{ joinSql: string }> = ({joinSql}) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Tooltip2 content="See join details">
                <Icon icon="intersection" onClick={() => setIsOpen(true)}/>
            </Tooltip2>
            <Dialog
                isOpen={isOpen}
                icon="intersection"
                onClose={() => setIsOpen(false)}
                title="Join details"
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        FULL OUTER JOIN <b>{joinSql}</b>
                    </p>
                </div>
            </Dialog>
        </>
    )
}

export default ExploreTree;