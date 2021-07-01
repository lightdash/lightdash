import React, {FC, useCallback, useMemo, useState} from "react";
import {CompiledTable, Dimension, Explore, FieldId, fieldId, friendlyName, Metric, Source} from "common";
import {
    Button,
    Classes,
    Colors,
    Icon,
    InputGroup,
    Intent,
    Tree,
    Dialog,
    Menu,
    MenuItem,
    PopoverPosition,
} from "@blueprintjs/core";
import {Popover2, Tooltip2} from "@blueprintjs/popover2";
import Fuse from 'fuse.js';
import {TreeEventHandler} from "@blueprintjs/core/src/components/tree/tree";
import { TreeNodeInfo} from "@blueprintjs/core/src/components/tree/treeNode";
import SyntaxHighlighter from "react-syntax-highlighter";
import { a11yDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {CopyToClipboard} from 'react-copy-to-clipboard';

type NodeDataProps = {
    fieldId: FieldId,
    isDimension: boolean,
    source: Source,
}

type ExploreTreeProps = {
    explore: Explore;
    onSelectedNodeChange: (fieldId: string, isDimension: boolean) => void;
    selectedNodes: Set<string>;
};

const ExploreTree: FC<ExploreTreeProps> = ({explore, selectedNodes, onSelectedNodeChange}) => {
    const [search, setSearch] = useState<string>('');
    const [source, setSource] = useState<Source>();

    return (
        <div style={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
            <div style={{padding: '10px 15px 15px 10px'}}>
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
                        joinSql={explore.joinedTables.find(joinTable => joinTable.table === table.name)?.compiledSqlOn}
                        selectedNodes={selectedNodes}
                        onSelectedNodeChange={onSelectedNodeChange}
                        onOpenSourceDialog={setSource}
                    />
                ))}
            </div>
            {source && (
                <SourceDialog source={source} onClose={() => setSource(undefined)}/>
            )}
        </div>
    )
}

type TableTreeProps = {
    search: string;
    table: CompiledTable;
    joinSql?: string;
    selectedNodes: ExploreTreeProps['selectedNodes'];
    onSelectedNodeChange: ExploreTreeProps['onSelectedNodeChange'];
    onOpenSourceDialog: (source: Source) => void;
}

const TableTree: FC<TableTreeProps> = ({search, table, joinSql, selectedNodes, onSelectedNodeChange, onOpenSourceDialog}) => {
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

    const contents: TreeNodeInfo<NodeDataProps>[] = [{
        id: table.name,
        label: friendlyName(table.name),
        isExpanded: expanded,
        secondaryLabel: <TableButtons joinSql={joinSql} table={table} onOpenSourceDialog={onOpenSourceDialog}/>,
        childNodes: [
            {
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
                    label: (<Tooltip2 content={metric.description}>{friendlyName(metric.name)}</Tooltip2>),
                    nodeData: {fieldId: fieldId(metric), isDimension: false} as NodeDataProps,
                    isSelected: selectedNodes.has(fieldId(metric)),
                    secondaryLabel: metric.source && <NodeItemButtons node={metric} onOpenSourceDialog={onOpenSourceDialog}/>
                }))
            },
            {
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
                    label: (<Tooltip2 content={dimension.description}>{friendlyName(dimension.name)}</Tooltip2>),
                    nodeData: {fieldId: fieldId(dimension), isDimension: true} as NodeDataProps,
                    isSelected: selectedNodes.has(fieldId(dimension)),
                    secondaryLabel: dimension.source && <NodeItemButtons node={dimension} onOpenSourceDialog={onOpenSourceDialog}/>
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

const TableButtons: FC<{ joinSql?: string, table: CompiledTable, onOpenSourceDialog: (source: Source) => void }> = ({
                                                                                                                        joinSql,
                                                                                                                        table: {source},
                                                                                                                        onOpenSourceDialog
                                                                                                                    }) => {
    const [isOpen, setIsOpen] = useState<boolean>();
    const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
    console.log(`${joinSql} - ${source}`)
    return (
        <div style={{display: 'inline-flex', gap: '10px'}}>
            {(source || joinSql) && <Popover2
                isOpen={isOpen}
                onInteraction={setIsOpen}
                content={(
                    <Menu>
                        {source && <MenuItem
                            icon={<Icon icon="console"/>}
                            text="Source"
                            onClick={(e) => {
                                if (source === undefined) {
                                    return;
                                }
                                e.stopPropagation();
                                onOpenSourceDialog(source);
                                setIsOpen(false);
                            }}
                        />}
                        {joinSql && (
                            <MenuItem
                                icon={<Icon icon="intersection"/>}
                                text="Join details"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsJoinDialogOpen(true);
                                    setIsOpen(false);
                                }}
                            />
                        )}
                    </Menu>
                )}
                position={PopoverPosition.BOTTOM_LEFT}
                lazy={true}
            >
                <Tooltip2 content="View options">
                    <Button minimal={true} icon={'more'} onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(true);
                    }}/>
                </Tooltip2>
            </Popover2>}
            <Dialog
                isOpen={isJoinDialogOpen}
                icon="intersection"
                onClose={() => setIsJoinDialogOpen(false)}
                title="Join details"
                lazy={true}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        LEFT JOIN <b>{joinSql}</b>
                    </p>
                </div>
            </Dialog>
        </div>
    )
}

const NodeItemButtons: FC<{node: Metric | Dimension, onOpenSourceDialog: (source: Source) => void}> = ({ node: {description, source} , onOpenSourceDialog}) => {
    const [isOpen, setIsOpen] = useState<boolean>();
    return (
        <div style={{display: 'inline-flex', gap: '10px'}}>
            <Popover2
                isOpen={isOpen}
                onInteraction={setIsOpen}
                content={(
                    <Menu>
                        <MenuItem
                            icon={<Icon icon="console"/>}
                            text="Source"
                            onClick={(e) => {
                                if (source === undefined) {
                                    return;
                                }
                                e.stopPropagation();
                                onOpenSourceDialog(source);
                                setIsOpen(false);
                            }}
                        />
                    </Menu>
                )}
                position={PopoverPosition.BOTTOM_LEFT}
                lazy={true}
            >
                <Tooltip2 content="View options">
                    <Button minimal={true} icon={'more'} onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(true);
                    }}/>
                </Tooltip2>
            </Popover2>
        </div>
    )
}

const SourceDialog: FC<{source: Source, onClose: () => void}> = ({source, onClose}) => {
    const [copied, setCopied] = useState(false);
    return (
        <Dialog
            isOpen={true}
            icon="console"
            onClose={onClose}
            lazy={true}
            title="Source"
            style={{width: '800px'}}
        >
            <div className={Classes.DIALOG_BODY}>
                <Tooltip2 isOpen={copied} content="Copied path!" intent={'success'} position={PopoverPosition.RIGHT}>
                    <InputGroup
                        readOnly={true}
                        type={"text"}
                        defaultValue={source.path}
                        rightElement={(
                            <CopyToClipboard
                                text={source.path}
                                options={{message: 'Copied!'}}
                                onCopy={() => setCopied(true)}
                            >
                                <Button minimal={true} icon={'clipboard'}/>
                            </CopyToClipboard>
                        )}
                    />
                </Tooltip2>
                <SyntaxHighlighter
                    language="yml" showLineNumbers={true}
                    startingLineNumber={source.range.start.line}
                    style={a11yDark}
                >
                    {source.content}
                </SyntaxHighlighter>
            </div>
        </Dialog>
    )
}

export default ExploreTree;
