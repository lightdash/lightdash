import React, {Component} from "react";
import {Explore, Field, fieldId, friendlyName, getDimensions, getFields, getMetrics, isDimension, Table} from "common";
import {Button, Classes, Colors, Icon, InputGroup, Intent, ITreeNode, Tree} from "@blueprintjs/core";
import {Tooltip2} from "@blueprintjs/popover2";
import Fuse from 'fuse.js';

type SideTreeProps = {
    fields: Field[]
    onSelectedNodeChange: (columnid: string) => void
    selectedNodes: Set<string>,
    fuse: Fuse<Field>,
};
type SideTreeState = {
    expandedNodes: { [key: string]: boolean },
    searchValue: string,
};

export class SideTree extends Component<SideTreeProps, SideTreeState> {

    constructor(props: SideTreeProps) {
        super(props);
        this.handleNodeCollapse = this.handleNodeCollapse.bind(this);
        this.handleNodeExpand = this.handleNodeExpand.bind(this);
        this.handleOnNodeClick = this.handleOnNodeClick.bind(this);
        this.onSideTreeSelect = this.onSideTreeSelect.bind(this);
        this.onSearchChange = this.onSearchChange.bind(this);
        this.state = {
            expandedNodes: Object.fromEntries(Array.from(new Set(this.props.fields.map(f => f.table))).map(name => [name, true])),
            searchValue: '',
        };
    }

    render() {
        const fields = this.state.searchValue === '' ? this.props.fields : this.props.fuse.search(this.state.searchValue).map(res => res.item)
        const tableNames = Array.from(new Set(fields.map(f => f.table)))
        const tables = tableNames.map(tableName => {
            const ms = fields.filter(field => (field.table === tableName) && (!isDimension(field)))
            const ds = fields.filter(field => (field.table === tableName) && (isDimension(field)))
            return {
                name: tableName,
                metrics: ms,
                dimensions: ds,
            }
        })

        const contents = tables.map(table => ({
            key: table.name,
            id: table.name,
            label: friendlyName(table.name),
            isExpanded: this.state.expandedNodes[table.name] || false,
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
                    childNodes: table.metrics.map(metric => ({
                        key: metric.name,
                        id: metric.name,
                        label: friendlyName(metric.name),
                        nodeData: {relation: metric.table},
                        isSelected: this.props.selectedNodes.has(fieldId(metric)),
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
                    childNodes: table.dimensions.map(dimension => ({
                        key: dimension.name,
                        id: dimension.name,
                        label: friendlyName(dimension.name),
                        nodeData: {relation: dimension.table},
                        isSelected: this.props.selectedNodes.has(fieldId(dimension)),
                        secondaryLabel: dimension.description ? (
                            <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center'}}>
                                <Tooltip2 content={dimension.description}>
                                    <Icon icon="info-sign" iconSize={12}/>
                                </Tooltip2>
                            </div>
                        ) : null
                    }))
                },
            ]
        }))
        return (
            <div style={{height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                <div style={{padding: '0 15px 15px 10px'}}>
                    <InputGroup
                        leftIcon={'search'}
                        rightElement={<Button minimal={true} icon={'cross'} onClick={() => this.onSearchChange('')}/> }
                        placeholder='Search metrics'
                        value={this.state.searchValue}
                        onChange={e => this.onSearchChange(e.target.value)}
                    />
                </div>
                <div style={{overflowY: 'auto'}}>
                    <Tree
                        contents={contents}
                        onNodeCollapse={this.handleNodeCollapse}
                        onNodeExpand={this.handleNodeExpand}
                        onNodeClick={this.handleOnNodeClick}
                    />
                </div>
            </div>
        )
    };

    handleNodeCollapse = (nodeData: ITreeNode) => {
        this.setState(state => ({
            expandedNodes: {...state.expandedNodes, [nodeData.id]: false},
        }))
    };

    handleNodeExpand = (nodeData: ITreeNode) => {
        this.setState(state => ({
            expandedNodes: {...state.expandedNodes, [nodeData.id]: true},
        }))
    };

    handleOnNodeClick = (nodeData: ITreeNode<{ relation: string }>, _nodePath: number[]) => {
        if (_nodePath.length !== 1) {
            if (nodeData.nodeData) {
                this.onSideTreeSelect(nodeData.nodeData.relation, `${nodeData.id}`)
            }
        }
        ;
    }

    onSideTreeSelect = (relation: string, name: string) => {
        const id = `${relation}_${name}`
        this.props.onSelectedNodeChange(id)
    }

    onSearchChange = (search: string) => {
        this.setState(state => ({
            searchValue: search
        }))
    }



}