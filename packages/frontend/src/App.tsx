import React, {Component, useEffect, useState} from 'react';
import {
    Alignment,
    Button,
    Classes,
    Colors, FormGroup,
    HTMLTable,
    Icon,
    Intent,
    ITreeNode,
    MenuItem,
    Navbar,
    NonIdealState,
    Spinner,
    Tab,
    Tabs,
    Tag,
    Tree
} from '@blueprintjs/core';
import {Tooltip2} from "@blueprintjs/popover2";
import {
    Dimension,
    DimensionType,
    Direction,
    Explore,
    Field,
    fieldId,
    getDimensions,
    getMeasures,
    Measure,
    Relation,
    SortField
} from "common";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/table/lib/css/table.css";
import "@blueprintjs/popover2/lib/css/blueprint-popover2.css";
import {buildQuery, refFromName} from "./queryBuilder";
import {usePagination, useSortBy, useTable} from "react-table";
import {ItemRenderer, Select} from "@blueprintjs/select";
import {getExplores, runQuery} from "./api";


const hexToRGB = (hex: string, alpha: number) => {
    const h = parseInt('0x' + hex.substring(1))
    const r = (h >> 16) & 0xFF
    const g = (h >> 8) & 0xFF
    const b = (h & 0xFF)
    return `rgb(${r}, ${g}, ${b}, ${alpha})`
}

const ExploreSelect = Select.ofType<Explore>()
const exploreSelectRenderer: ItemRenderer<Explore> = (explore, {handleClick, modifiers }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem
            active={modifiers.active}
            key={explore.name}
            label={explore.relations[explore.baseRelation]?.table || ''}
            onClick={handleClick}
            text={explore.name}
        />
    )
}

function App() {
    const [explores, setExplores] = useState<Explore[]>([])
    const [activeExplore, setActiveExplore] = useState<Explore>()
    const [isExploresLoading, setIsExploresLoading] = useState(false)

    const [measures, setMeasures] = useState<Measure[]>([]);
    const [dimensions, setDimensions] = useState<Dimension[]>([])
    const [activeDimensions, setActiveDimensions] = useState<Dimension[]>([])
    const [activeMeasures, setActiveMeasures] = useState<Measure[]>([])
    const [activeSorts, setActiveSorts] = useState<SortField[]>([])
    const [activeColumnIds, setActiveColumnIds] = useState<Set<string>>(new Set())
    const [activeTab, setActiveTab] = useState<string | number>('results')
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [tableData, setTableData] = useState<{[column: string]: any}[]>([]);

    const getTab = (tab: string|number) => {
        return (
            <div style={{height: '100%'}}>
                <div style={tab !== 'sql' ? {display: 'none'} : {}}>
                    <RenderedSql explore={activeExplore} measures={activeMeasures} dimensions={activeDimensions}
                                 sorts={activeSorts}/>
                </div>
                <div style={tab !== 'results' ? {display: 'none'} : {height: '100%'}}>
                    <ExploreTable isDataLoading={isTableLoading} dimensions={activeDimensions} measures={activeMeasures}
                                  data={tableData} sortFields={[]} onSortFieldChange={setActiveSorts}/>
                </div>
                <div style={tab !== 'filters' ? {display: 'none'} : {}}>
                    <span>
                        <Filters />
                    </span>
                </div>
            </div>
        )
    }

    const refreshExplores = async () => {
        setIsExploresLoading(true)
        getExplores(true)
            .then(explores => {
                setExplores(explores)
                const prevExplore = explores.find(e => e.name === activeExplore?.name)
                setActiveExplore(prevExplore)
                setIsExploresLoading(false)
            })
    }

    // on load
    useEffect(() => {
        setIsExploresLoading(true)
        getExplores(false)
            .then(explores => {
                setExplores(explores)
                setIsExploresLoading(false)
            })
    }, [])

    // Update available measures on explore change
    useEffect(() => {
        if (activeExplore) {
            setMeasures(getMeasures(activeExplore))
            setDimensions(getDimensions(activeExplore))
            setActiveMeasures([])
            setActiveDimensions([])
        }
    }, [activeExplore])

    useEffect(() => {
        setActiveMeasures(measures.filter(m => activeColumnIds.has(fieldId(m))))
        setActiveDimensions(dimensions.filter(d => activeColumnIds.has(fieldId(d))))
    }, [activeColumnIds, measures, dimensions])

    useEffect(() => {
    }, [activeMeasures, activeDimensions])


    const runSql = () => {
        setIsTableLoading(true);
        setTableData([])
        if (activeExplore) {
            // Sort by first field if not sorts
            const fields: Field[] = [...activeDimensions, ...activeMeasures]
            if (fields.length > 0) {
                const query = buildQuery({explore: activeExplore, dimensions: activeDimensions, measures: activeMeasures, filters: [], sorts: activeSorts})
                runQuery(query)
                    .then(rows => {
                        setTableData(rows)
                        setIsTableLoading(false)
                    })
            }
        }
    }

    const onSideTreeNodeChange = async (id: string, ids: Set<string>) => {
        setActiveColumnIds(ids)
    }

    return (
        <div style={{
            height: 'calc(100vh - 50px)',
        }}>
            <Navbar className="bp3-dark">
                <Navbar.Group align={Alignment.LEFT}>
                    <Navbar.Heading>Seeker</Navbar.Heading>
                    <Navbar.Divider />
                    <ExploreSelect items={explores} itemRenderer={exploreSelectRenderer} onItemSelect={setActiveExplore}>
                        {isExploresLoading && (
                            <Spinner size={Spinner.SIZE_SMALL}/>
                        )}
                        {isExploresLoading || (
                            <Button
                                rightIcon="caret-down"
                                text={activeExplore ? `Model: ${activeExplore.name}` : "Select a model to explore"}
                            />
                        )}
                    </ExploreSelect>
              </Navbar.Group>
                <Navbar.Group align={Alignment.RIGHT}>
                    <Button icon={'refresh'} onClick={refreshExplores} />
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
                  width: '300px',
              }}>
                  <SideTree
                    explore={activeExplore}
                    onSelectedNodeChange={onSideTreeNodeChange}
                  />
              </div>
              <div style={{
                  padding: 30,
                  flexGrow: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-start",
              }}>
                  <div style={{display: "flex", flexDirection: "row", justifyContent: "flex-end"}}>
                      <Button intent={"primary"} style={{width: 200}} onClick={runSql} disabled={[...activeMeasures, ...activeDimensions].length === 0}>Run query</Button>
                  </div>
                  <Tabs defaultSelectedTabId='results' onChange={setActiveTab}>
                      <Tab id='filters' title='Filters' />
                      <Tab id='sql' title='SQL' />
                      <Tab id='results' title='Results' />
                  </Tabs>
                  <div style={{height: '100%', paddingTop: '20px'}}>
                      {getTab(activeTab)}
                  </div>
              </div>
          </div>
      </div>
  );
}

type RenderedSqlProps = {
    explore: Explore | undefined,
    measures: Measure[],
    dimensions: Dimension[],
    sorts: SortField[],
}

const RenderedSql = ({ explore, measures, dimensions, sorts}: RenderedSqlProps) => (
    <pre className="bp3-code-block"><code>{ explore ? buildQuery({explore, measures, dimensions, sorts, filters: []}) : ''}</code></pre>
)

type SideTreeProps = {
    explore: Explore | undefined,
    onSelectedNodeChange: (nodeId: string, selectedNodeIds: Set<string>) => void
};
type SideTreeState = {
    expandedNodes: { [key: string]: boolean},
    selectedNodes: Set<string>,
};
class SideTree extends Component<SideTreeProps, SideTreeState> {

    constructor(props: SideTreeProps) {
        super(props);
        this.handleNodeCollapse = this.handleNodeCollapse.bind(this);
        this.handleNodeExpand = this.handleNodeExpand.bind(this);
        this.handleOnNodeClick = this.handleOnNodeClick.bind(this);
        this.onSideTreeSelect = this.onSideTreeSelect.bind(this);
        this.state = {
            expandedNodes: Object.fromEntries(Object.keys(this.props.explore?.relations || {}).map(name => [name, true])),
            selectedNodes: new Set<string>(),
        };
    }

    render() {
        const relations = Object.values(this.props.explore?.relations || {}) as Relation[]
        const contents = relations.map( relation => ({
            key: relation.name,
            id: relation.name,
            label: relation.name,
            isExpanded: this.state.expandedNodes[relation.name] || false,
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
                    childNodes: Object.values(relation.dimensions).map( dimension => ({
                        key: dimension.name,
                        id: dimension.name,
                        label: dimension.name,
                        nodeData: {relation: dimension.relation},
                        isSelected: this.state.selectedNodes.has(fieldId(dimension)),
                        secondaryLabel: dimension.description ? (
                            <Tooltip2 content={dimension.description}>
                                <Icon icon="info-sign" iconSize={12}/>
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
                    childNodes: Object.values(relation.measures).map( measure => ({
                        key: measure.name,
                        id: measure.name,
                        label: measure.name,
                        nodeData: {relation: measure.relation},
                        isSelected: this.state.selectedNodes.has(fieldId(measure)),
                        secondaryLabel: measure.description ? (
                            <Tooltip2 content={measure.description}>
                                <Icon icon="info-sign" iconSize={12}/>
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

    handleOnNodeClick = (nodeData: ITreeNode<{relation: string}>, _nodePath: number[]) => {
        if (_nodePath.length !== 1) {
            if (nodeData.nodeData) {
                this.onSideTreeSelect(nodeData.nodeData.relation, `${nodeData.id}`)
            }
        };
    }

    onSideTreeSelect = (relation: string, name: string) => {
        const id = `${relation}.${name}`
        this.setState((state) => {
            const ids = new Set(state.selectedNodes)
            ids.has(id) ? ids.delete(id) : ids.add(id)
            this.props.onSelectedNodeChange(id, ids)
            return {selectedNodes: ids}
        })
    }

}


type ExploreTableProps = {
    dimensions: Dimension[],
    measures: Measure[],
    data: {[columnName: string]: any}[],
    sortFields: SortField[],
    onSortFieldChange: (sortFields: SortField[]) => void,
    isDataLoading: boolean,
}


const ExploreTable = ({ dimensions, measures, data, onSortFieldChange, isDataLoading }: ExploreTableProps) => {
    const columnId = (field: Field) => `${field.relation}_${refFromName(field.name)}`
    const dimensionColumnIds = dimensions.map(columnId)

    const formatDate = (date: string | Date) => new Date(date).toISOString().slice(0, 10)
    const formatTimestamp = (datetime: string | Date) => new Date(datetime).toISOString()
    const formatNumber = (v: number) => `${v}`
    const formatString = (v: string) => `${v}`
    const formatDefault = (v: any) => `${v}`
    const formatBoolean = (v: boolean | string) => `${v}` in ['True', 'true', 'yes', 'Yes', '1', 'T'] ? 'Yes' : 'No'

    const getDimensionFormatter = React.useMemo(() => (d: Dimension) => {
        if (d.type === DimensionType.number)
            return ({ value }: any) => formatNumber(value)
        else if (d.type === DimensionType.string)
            return ({ value }: any) => formatString(value)
        else if (d.type === DimensionType.timestamp)
            return ({ value }: any) => formatTimestamp(value)
        else if (d.type === DimensionType.date)
            return ({ value }: any) => formatDate(value)
        else if (d.type === DimensionType.boolean)
            return ({ value }: any) => formatBoolean(value)
        else
            return ({ value }: any) => formatDefault(value)
    }, [])

    const getMeasureFormatter = React.useMemo( () => (m: Measure) => {
        return ({ value }: any) => formatNumber(value)
    }, [])

    const capitalize = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

    const dimColumns = React.useMemo(() => dimensions.map( dim => ({
        Header: <span>{capitalize(dim.relation)} <b>{capitalize(dim.name)}</b></span>,
        accessor: columnId(dim),
        Cell: getDimensionFormatter(dim)
    })), [dimensions, getDimensionFormatter])
    const measureColumns = React.useMemo(() => measures.map(m => ({
        Header: <span>{capitalize(m.relation)} <b>{capitalize(m.name)}</b></span>,
        accessor: columnId(m),
        Cell: getMeasureFormatter(m),
    })), [measures, getMeasureFormatter])
    const columns = React.useMemo(() => [...dimColumns, ...measureColumns], [dimColumns, measureColumns])

    const {
        getTableProps,
        headerGroups,
        getTableBodyProps,
        page,
        prepareRow,
        setSortBy,
        pageCount,
        nextPage,
        canNextPage,
        previousPage,
        canPreviousPage,
        state: { pageIndex, pageSize, sortBy }
    } = useTable({ columns, data, manualSortBy: true, initialState: { pageIndex: 0, pageSize: 25}, autoResetSortBy: false }, useSortBy, usePagination)

    useEffect(() => {
        setSortBy(sortBy.filter(sb => columns.find(col => col.accessor === sb.id)))
    }, [columns])

    useEffect(() => {
        onSortFieldChange(sortBy.map(sb => {
            const field = [...dimensions, ...measures].find(f => columnId(f) === sb.id) as Field
            return {
                field: field,
                direction: sb.desc ? Direction.descending : Direction.ascending
            }
        }))
    }, [sortBy, onSortFieldChange, dimensions, measures])

    const getColumnStyle = (columnId: string) => {
        const isDimension = dimensionColumnIds.find(v => v === columnId)
        return {
            style: {
                backgroundColor: isDimension ? hexToRGB(Colors.BLUE1, 0.2) : hexToRGB(Colors.ORANGE1, 0.2),
            }
        }
    }

    const getRowStyle = (rowIndex: number, columnId: string) => {
        const isDimension = dimensionColumnIds.find(v => v === columnId)
        return {
            style: {
                backgroundColor: rowIndex % 2 ? undefined : Colors.LIGHT_GRAY4,
                textAlign: isDimension ? 'left' as 'left': 'right' as 'right',
            }
    }}

    const getHeaderStyle = (columnId: string) => {
        const isDimension = dimensionColumnIds.find(v => v === columnId)
        return {
            style: {
                textAlign: isDimension ? 'left' as 'left': 'right' as 'right',
            }
        }
    }

    if (columns.length === 0) {
        return (
            <NonIdealState
                title="Select fields to explore"
                description="Get started by selecting dimensions and measures."
                icon='hand-left'
            />
        )
    }

    const getSortIndicator = (columnId: string, desc: boolean, sortIndex: number) => {
        const isDimension = dimensionColumnIds.find(v => v === columnId)
        const style = {paddingLeft: '5px'}
        if (isDimension)
            return <React.Fragment>
                {(sortBy.length > 1) && <Tag minimal style={style}>{sortIndex + 1}</Tag>}
                {desc ? <Icon style={style} icon={"sort-alphabetical-desc"} /> : <Icon style={style} icon={"sort-alphabetical"} />}
            </React.Fragment>
        else
            return <React.Fragment>
                {(sortBy.length > 1) && <Tag minimal style={style}>{sortIndex + 1}</Tag>}
                {desc ? <Icon style={style} icon={"sort-numerical-desc"} /> : <Icon style={style} icon={"sort-numerical"} />}
            </React.Fragment>
    }

    return (
        <div style={{height: '100%'}}>
            <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
                <div style={{display: 'block', maxWidth: '100%'}}>
                    <HTMLTable bordered condensed {...getTableProps()} style={{width: '100%'}}>
                        {headerGroups.map(headerGroup => (
                            <colgroup>
                                {headerGroup.headers.map(column => (
                                    <col {...column.getHeaderProps([getColumnStyle(column.id)])} />
                                ))}
                            </colgroup>
                        ))}
                        <thead>
                        {headerGroups.map(headerGroup => (
                            <tr {...headerGroup.getHeaderGroupProps()}>
                                {headerGroup.headers.map(column => (
                                    <th {...column.getHeaderProps([column.getSortByToggleProps(), getHeaderStyle(column.id)])}>
                                        {column.render('Header')}
                                        {column.isSorted && getSortIndicator(column.id, column.isSortedDesc || false, column.sortedIndex)}
                                    </th>
                                ))}
                            </tr>
                        ))}
                        </thead>
                        <tbody {...getTableBodyProps()}>
                        {page.map(row => {
                            prepareRow(row)
                            return (
                                <tr {...row.getRowProps()}>
                                    {row.cells.map(cell => {
                                        return (
                                            <td {...cell.getCellProps([getRowStyle(row.index, cell.column.id)])}>
                                                {cell.render('Cell')}
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                        </tbody>
                    </HTMLTable>
                    { pageCount > 1 && (
                        <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center'}}>
                            {canPreviousPage && <Button icon={'arrow-left'} onClick={previousPage} />}
                            <span style={{paddingRight: '5px', paddingLeft: '5px'}}>Page {pageIndex + 1} of {pageCount}</span>
                            {canNextPage && <Button icon={'arrow-right'} onClick={nextPage} />}
                        </div>
                    )}
                </div>
            </div>
            { isDataLoading && (
                <div style={{height: '100%', flexDirection: 'column', justifyContent: 'center'}}>
                    <NonIdealState
                        title='Loading results'
                        icon={<Spinner />}
                    />
                </div>
            )}
        </div>
    )
}

const Filters = () => {
    return (
        <form>
            <FormGroup>

            </FormGroup>
        </form>
    )
}

export default App;