import React, {Component, useEffect, useState} from 'react';
import {Alignment, Button, Classes, Colors, Icon, Intent, ITreeNode, Navbar, Tree} from '@blueprintjs/core';
import {Tooltip2} from "@blueprintjs/popover2";
import {Cell, Column, Table, TableLoadingOption} from '@blueprintjs/table';
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/table/lib/css/table.css";
import "@blueprintjs/popover2/lib/css/blueprint-popover2.css";
import {SeekerDimension, SeekerMeasure, SeekerView, SeekerViewColumn} from "./seekerTypes";
import {loadModelNodes, translateDbtModelToSeekerView} from "./dbt";

const measureTypes: { [key: string]: (sql: string) => string} = {
    'max': (sql: string) => `MAX( ${sql} )`,
    'count distinct': (sql: string) => `COUNT( DISTINCT ${sql} )` ,
}

type GeneratedSqlProps = {
    dimensions?: SeekerDimension[]
    measures?: SeekerMeasure[]
}

const hexToRGB = (hex: string, alpha: number) => {
    const h = parseInt('0x' + hex.substring(1))
    const r = h >> 16 & 0xFF
    const g = h >> 8 & 0xFF
    const b = h & 0xFF
    return `rgb(${r}, ${g}, ${b}, ${alpha})`
}

const niceSqlName = (sql: string): string => sql.toLowerCase().split(' ').join('_')

const generateSql = ({ dimensions = [], measures = [] }: GeneratedSqlProps) => {
    const allTableSql = [...dimensions, ...measures].map(
        (col: SeekerViewColumn) => `\`${col.database}.${col.schema}.${col.tableName}\` AS ${col.tableName}`
    )
    const tableSql = allTableSql.filter((val, idx, arr) => arr.indexOf(val) === idx);
    const dimensionSql = dimensions.map(d => `${d.tableName}.${d.sql} AS \`${niceSqlName(d.name)}\``)
    const groupsSql = (dimensions?.length > 0) && (measures?.length > 0) ? 'GROUP BY ' + dimensions.map((dim, idx) => `${idx + 1}`).join(', ') : ''
    const measureSql = measures.map(m => `${measureTypes[m.type](m.tableName + '.' + m.sql)} AS \`${niceSqlName(m.name)}\``)
    return `SELECT
  ${[...dimensionSql, measureSql].join(',\n  ')}
FROM ${tableSql.join('\nLEFT JOIN  ')}
${groupsSql}
`
}


const views: { [id: string]: SeekerView} = Object.fromEntries(loadModelNodes()
    .map(translateDbtModelToSeekerView)
    .map(view => [view.id, view]))

const dimensions = Object.assign({}, ...Object.values(views).map(view => view.dimensions))
const measures = Object.assign({}, ...Object.values(views).map(view => view.measures))

function App() {
    const [activeColumnIds, setActiveColumnIds] = useState<{[key: string]: boolean}>({})
    const [activeDimensions, setActiveDimensions] = useState<SeekerDimension[]>([])
    const [activeMeasures, setActiveMeasures] = useState<SeekerMeasure[]>([])
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [tableData, setTableData] = useState<{[column: string]: string}[]>([]);

    const onSideTreeSelect = (dimensionId: string) => {
        setActiveColumnIds(ad => ({
            ...ad,
            [dimensionId]: !(ad[dimensionId] || false),
        }))
    }

    useEffect( () => {
        const ids = Object.keys(activeColumnIds).filter(id => activeColumnIds[id] || false)
        setActiveDimensions(ids.map(id => dimensions[id]).filter(Boolean))
        setActiveMeasures(ids.map(id => measures[id]).filter(Boolean))
    }, [activeColumnIds])

    const cellRender = (rowIndex: number, colIndex: number) => {
        const isDimension = colIndex < activeDimensions.length;
        const isEven = (rowIndex % 2) === 0
        const color = isDimension
            ? (isEven ? hexToRGB(Colors.BLUE3, 0.1) : hexToRGB(Colors.BLUE3, 0.2))
            : (isEven ? hexToRGB(Colors.ORANGE3, 0.1) : hexToRGB(Colors.ORANGE3, 0.2))
        const value = Object.values(tableData[rowIndex])[colIndex];
        return <Cell style={{backgroundColor: color}}>{value}</Cell>
    }

    const runSql = () => {
        setIsTableLoading(true);
        fetch('/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                projectId: 'alpine-land-278512',
                query: generateSql({dimensions: activeDimensions, measures: activeMeasures}),
            })
        })
            .then(r => r.json())
            .then(rows => {
                console.log(rows)
                setTableData(rows);
                setIsTableLoading(false);
            })
    };

    return (
        <div style={{
            height: "100vh",
        }}>
            <Navbar className="bp3-dark">
                <Navbar.Group align={Alignment.LEFT}>
                    <Navbar.Heading>Seeker</Navbar.Heading>
              </Navbar.Group>
          </Navbar>
          <div style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              justifyContent: "flex-start",
              alignItems: "stretch",
              height: "100%",
          }}>
              <div style={{
                  backgroundColor: Colors.LIGHT_GRAY4,
                  flexGrow: 1,
              }}>
                  <SideTree
                    onNodeSelect={onSideTreeSelect}
                    selectedNodes={activeColumnIds}
                  />
              </div>
              <div style={{
                  flexGrow: 4,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-start",
              }}>
                  <div style={{height: 400}}>
                      <Table numRows={tableData.length} loadingOptions={isTableLoading ? [TableLoadingOption.CELLS, TableLoadingOption.ROW_HEADERS] : []}>
                          {
                              [
                                  ...Object.values(views).flatMap(view => Object.values(view.dimensions).map(dimension => ({...dimension, viewName: view.name}))),
                                  ...Object.values(views).flatMap(view => Object.values(view.measures).map(measure => ({...measure, viewName: view.name}))),
                              ]
                                  .filter(col => activeColumnIds[col.id])
                                  .map(col => (
                                          <Column
                                              name={`${col.viewName} ${col.name}`}
                                              key={col.id}
                                              cellRenderer={cellRender}
                                          />
                                      )
                                  )
                          }
                      </Table>
                  </div>
                  <p>
                      <pre className="bp3-code-block"><code>{ generateSql({dimensions: activeDimensions, measures: activeMeasures}) }</code></pre>
                  </p>
                  <Button intent={"primary"} style={{width: 200}} onClick={runSql}>
                      Run
                  </Button>
              </div>
          </div>
      </div>
  );
}

type SideTreeProps = {
    selectedNodes: { [key: string]: boolean},
    onNodeSelect: ((id: string) => void);
};
type SideTreeState = {
    expandedNodes: { [key: string]: boolean},
};
class SideTree extends Component<SideTreeProps, SideTreeState> {

    constructor(props: SideTreeProps) {
        super(props);
        this.handleNodeCollapse = this.handleNodeCollapse.bind(this);
        this.handleNodeExpand = this.handleNodeExpand.bind(this);
        this.handleOnNodeClick = this.handleOnNodeClick.bind(this);
        this.state = {
            expandedNodes: {},
        };
    }

    render() {
        const contents = Object.values(views).map( view => ({
            key: view.id,
            id: view.id,
            label: view.name,
            isExpanded: this.state.expandedNodes[view.id] || false,
            childNodes: [
                {
                    key: "dimensions",
                    id: "dimensions",
                    label: (<span style={{color: Colors.BLUE1}}><strong>Dimensions</strong></span>),
                    icon: (
                        <Icon icon="tag" intent={Intent.PRIMARY} className={Classes.TREE_NODE_ICON} />
                    ),
                    hasCaret: false,
                    isExpanded: true,
                    childNodes: Object.values(view.dimensions).map( dimension => ({
                        key: dimension.id,
                        id: dimension.id,
                        label: dimension.name,
                        isSelected: this.props.selectedNodes[dimension.id],
                        secondaryLabel: dimension.description ? (
                            <Tooltip2 content={dimension.description}>
                                <Icon icon="eye-open" />
                            </Tooltip2>
                        ) : null
                    }))
                },
                {
                    key: "measures",
                    id: "measures",
                    label: (<span style={{color: Colors.ORANGE1}}><strong>Measures</strong></span>),
                    icon: (
                        <Icon icon="numerical" intent={Intent.WARNING} className={Classes.TREE_NODE_ICON} />
                    ),
                    isExpanded: true,
                    hasCaret: false,
                    childNodes: Object.values(view.measures).map( measure => ({
                        key: measure.id,
                        id: measure.id,
                        label: measure.name,
                        isSelected: this.props.selectedNodes[measure.id],
                        secondaryLabel: measure.description ? (
                            <Tooltip2 content={measure.description}>
                                <Icon icon="eye-open" />
                            </Tooltip2>
                        ) : null
                    }))
                },
            ]
        }))
        return (
            <Tree
                contents={contents}
                onNodeCollapse={this.handleNodeCollapse}
                onNodeExpand={this.handleNodeExpand}
                onNodeClick={this.handleOnNodeClick}
                className={Classes.ELEVATION_0}
                />
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

    handleOnNodeClick = (nodeData: ITreeNode, _nodePath: number[]) => {
        if (_nodePath.length !== 1) {
            this.props.onNodeSelect(`${nodeData.id}`)
        };
    }

}


export default App;
