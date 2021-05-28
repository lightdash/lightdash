import {
    Dimension,
    DimensionType,
    Explore,
    Field,
    fieldId,
    FilterGroup,
    friendlyName, getDimensions, getMetrics,
    Metric,
    SortField
} from "common";
import React, {useState} from "react";
import {usePagination, useTable} from "react-table";
import {buildQuery} from "./queryBuilder";
import {runQuery} from "./api";
import {CSVLink} from 'react-csv';
import {
    Button,
    Card, Code,
    Collapse,
    Colors, FormGroup, H5,
    HTMLTable,
    Icon,
    NonIdealState, NumericInput, Pre,
    Spinner,
    Tag
} from "@blueprintjs/core";
import {FiltersForm} from "./filters/FiltersForm";
import EChartsReact from "echarts-for-react";
import { ButtonGroup } from "@blueprintjs/core";
import {useExploreConfig} from "./hooks/useExploreConfig";
import {useExplores} from "./hooks/useExplores";
import {useColumns} from "./table";

const hexToRGB = (hex: string, alpha: number) => {
    const h = parseInt('0x' + hex.substring(1))
    const r = (h >> 16) & 0xFF
    const g = (h >> 8) & 0xFF
    const b = (h & 0xFF)
    return `rgb(${r}, ${g}, ${b}, ${alpha})`
}
type ExplorerProps = {
    activeFilters: FilterGroup[],
    onChangeActiveFilters: (filters: FilterGroup[]) => void,
    onError: ({title, text}: {title: string, text: string}) => void,
}
export const Explorer = ({
     activeFilters,
     onChangeActiveFilters,
     onError,
    }: ExplorerProps) => {
    const { activeFields, activeTableName, tableData, setTableData, setIsTableDataLoading, sortFields } = useExploreConfig()
    const exploresResults = useExplores()
    const activeExplore = (exploresResults.data || []).find(e => e.name === activeTableName)
    const activeDimensions = (activeExplore ? getDimensions(activeExplore) : []).filter(d => activeFields.has(fieldId(d)))
    const activeMetrics = (activeExplore ? getMetrics(activeExplore) : []).filter(m => activeFields.has(fieldId(m)))
    const [filterIsOpen, setFilterIsOpen] = useState<boolean>(false)
    const [resultsIsOpen, setResultsIsOpen] = useState<boolean>(true)
    const [sqlIsOpen, setSqlIsOpen] = useState<boolean>(false)
    const [vizIsOpen, setVizisOpen] = useState<boolean>(false)
    const totalActiveFilters = activeFilters.flatMap(filterGroup => filterGroup.filters.length).reduce((p, t) => p + t, 0)
    const [resultsRowLimit, setResultsRowLimit] = useState<number>(500)
    const [activeVizTab, setActiveVizTab] = useState<ChartType>('column')

    const runSql = () => {
        setIsTableDataLoading(true)
        setResultsIsOpen(true)
        setTableData([])
        if (activeExplore) {
            // Sort by first field if not sorts
            const fields: Field[] = [...activeDimensions, ...activeMetrics]
            if (fields.length > 0) {
                const query = buildQuery({
                    explore: activeExplore,
                    dimensions: activeDimensions,
                    metrics: activeMetrics,
                    filters: activeFilters,
                    sorts: sortFields,
                    limit: resultsRowLimit,
                })
                runQuery(query)
                    .then(response => {
                        if (response.status === 'error') {
                            setTableData([])
                            onError({title: 'Error running SQL query', text: response.error.data.databaseResponse})
                        }
                        else
                            setTableData(response.results)
                        setIsTableDataLoading(false)
                    })
            }
        }
    }

    return (
        <React.Fragment>
            <div style={{display: "flex", flexDirection: "row", justifyContent: "flex-end"}}>
                <Button intent={"primary"} style={{height: '40px', width: 150, marginRight: '10px'}} onClick={runSql}
                        disabled={[...activeMetrics, ...activeDimensions].length === 0}>Run query</Button>
                { exploresResults.isFetching
                    ? <Button disabled={true}><div style={{display: 'flex', flexDirection: 'row'}}><Spinner size={15}/><div style={{paddingRight: '5px'}} />Refreshing dbt</div></Button>
                    : <Button icon={'refresh'} onClick={exploresResults.refresh}></Button>
                }

            </div>
            <div style={{paddingTop: '10px'}} />
            <Card style={{padding: 5}} elevation={1}>
                <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
                    <Button disabled={activeExplore === undefined} icon={filterIsOpen ? 'chevron-down' : 'chevron-right'} minimal={true} onClick={() => setFilterIsOpen(f => !f)} />
                    <H5 style={{margin: 0, padding: 0}}>Filters</H5>
                    {totalActiveFilters > 0 ? <Tag style={{marginLeft: '10px'}}>{totalActiveFilters} active filters</Tag> : null}
                </div>
               <Collapse isOpen={filterIsOpen}>
                   {activeExplore && <FiltersForm explore={activeExplore} filters={activeFilters} onChangeFilters={onChangeActiveFilters} />}
               </Collapse>
            </Card>
            <div style={{paddingTop: '10px'}} />

            <Card style={{padding: 5}} elevation={1}>
                <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
                    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
                        <Button disabled={activeExplore === undefined} icon={vizIsOpen ? 'chevron-down' : 'chevron-right'} minimal={true} onClick={() => setVizisOpen(f => !f)} />
                        <H5 style={{margin: 0, padding: 0}}>Charts</H5>
                    </div>
                    {vizIsOpen &&
                        <ButtonGroup minimal={true}>
                            <Button active={activeVizTab === 'column' } icon={'timeline-bar-chart'} onClick={() => setActiveVizTab('column')}>Column</Button>
                            <Button active={activeVizTab === 'bar' } icon={'horizontal-bar-chart'} onClick={() => setActiveVizTab('bar')}>Bar</Button>
                            <Button active={activeVizTab === 'line' } icon={'timeline-line-chart'} onClick={() => setActiveVizTab('line')}>Line</Button>
                            <Button active={activeVizTab === 'scatter' } icon={'scatter-plot'} onClick={() => setActiveVizTab('scatter')}>Scatter</Button>
                        </ButtonGroup>
                    }
                </div>
                <Collapse isOpen={vizIsOpen}>
                    <SimpleChart results={tableData} dimensions={activeDimensions} metrics={activeMetrics} chartType={activeVizTab}/>
                </Collapse>
            </Card>
            <div style={{paddingTop: '10px'}} />

            <Card style={{ padding: 5 }} elevation={1}>
                <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
                    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
                        <Button icon={resultsIsOpen ? 'chevron-down' : 'chevron-right'} minimal={true} onClick={() => setResultsIsOpen(f => !f)} />
                        <H5 style={{margin: 0, padding: 0}}>Results</H5>
                    </div>
                    {resultsIsOpen && <FormGroup style={{marginRight: 12}} label="Total rows:" inline={true}><NumericInput style={{width: 100}} buttonPosition={'none'} value={resultsRowLimit} onValueChange={setResultsRowLimit}/></FormGroup>}
                </div>
                <Collapse isOpen={resultsIsOpen}>
                    <ExploreTable />
                </Collapse>
            </Card>
            <div style={{paddingTop: '10px'}} />
            <Card style={{padding: 5, height: sqlIsOpen ? '100%' : 'auto'}} elevation={1}>
                <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
                    <Button icon={sqlIsOpen ? 'chevron-down' : 'chevron-right'} minimal={true} onClick={() => setSqlIsOpen(f => !f)} />
                    <H5 style={{margin: 0, padding: 0}}>SQL</H5>
                </div>
                <Collapse isOpen={sqlIsOpen}>
                    <RenderedSql explore={activeExplore} metrics={activeMetrics} dimensions={activeDimensions}
                                 sorts={sortFields} filters={activeFilters} limit={resultsRowLimit}/>
                </Collapse>
            </Card>
        </React.Fragment>
    )
}

type RenderedSqlProps = {
    explore: Explore | undefined,
    metrics: Metric[],
    dimensions: Dimension[],
    sorts: SortField[],
    filters: FilterGroup[],
    limit: number
}
const RenderedSql = ({explore, metrics, dimensions, sorts, filters, limit}: RenderedSqlProps) => (
    <Pre style={{borderRadius: '0', boxShadow: 'none'}}><Code>{explore ? buildQuery({
        explore,
        metrics,
        dimensions,
        sorts,
        filters,
        limit: limit
    }) : ''}</Code></Pre>
)

const ExploreTable = () => {
    const columns = useColumns()
    const { tableData, isTableDataLoading, activeTableName } = useExploreConfig()

    const tableInstance = useTable({
        columns: columns,
        data: tableData,
        initialState: {
            pageIndex: 0,
            pageSize: 25,
        },
    }, usePagination)

    const getColumnStyle = (isDimension: boolean) => {
        return {
            style: {
                backgroundColor: isDimension ? hexToRGB(Colors.BLUE1, 0.2) : hexToRGB(Colors.ORANGE1, 0.2),
            }
        }
    }

    const getRowStyle = (rowIndex: number, isDimension: boolean) => {
        return {
            style: {
                backgroundColor: rowIndex % 2 ? undefined : Colors.LIGHT_GRAY4,
                textAlign: isDimension ? 'left' as 'left' : 'right' as 'right',
            }
        }
    }

    const getHeaderStyle = (isDimension: boolean) => {
        return {
            style: {
                textAlign: isDimension ? 'left' as 'left' : 'right' as 'right',
            }
        }
    }

    if (tableInstance.columns.length === 0) {
        return (
            <div style={{padding: '50px 0'}}>
                <NonIdealState
                    title="Select fields to explore"
                    description="Get started by selecting metrics and dimensions."
                    icon='hand-left'
                />
            </div>
        )
    }

    const getSortIndicator = (isDimension: boolean, dimensionType: DimensionType, desc: boolean, sortIndex: number, isMultiSort: boolean) => {
        const style = {paddingLeft: '5px'}
        if (isDimension && (dimensionType === 'string'))
            return <React.Fragment>
                {(isMultiSort) && <Tag minimal style={style}>{sortIndex + 1}</Tag>}
                {desc ? <Icon style={style} icon={"sort-alphabetical-desc"}/> :
                    <Icon style={style} icon={"sort-alphabetical"}/>}
            </React.Fragment>
        else
            return <React.Fragment>
                {isMultiSort && <Tag minimal style={style}>{sortIndex + 1}</Tag>}
                {desc ? <Icon style={style} icon={"sort-numerical-desc"}/> :
                    <Icon style={style} icon={"sort-numerical"}/>}
            </React.Fragment>
    }

    return (
        <div style={{height: '100%', padding: '10px', minHeight: '500px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
            <div style={{display: 'block', maxWidth: '100%'}}>
                <HTMLTable bordered condensed {...tableInstance.getTableProps()} style={{width: '100%'}}>
                    {tableInstance.headerGroups.map(headerGroup => (
                        <colgroup>
                            {headerGroup.headers.map(column => (
                                <col {...column.getHeaderProps([getColumnStyle(column.isDimension)])} />
                            ))}
                        </colgroup>
                    ))}
                    <thead>
                    {tableInstance.headerGroups.map(headerGroup => (
                        <tr {...headerGroup.getHeaderGroupProps()}>
                            {headerGroup.headers.map(column => (
                                <th {...column.getHeaderProps([column.getSortByToggleProps(), getHeaderStyle(column.isDimension)])}>
                                    {column.render('Header')}
                                    {column.isSorted && getSortIndicator(column.isDimension, column.dimensionType, column.isSortedDesc || false, column.sortedIndex, column.isMultiSort)}
                                </th>
                            ))}
                        </tr>
                    ))}
                    </thead>
                    <tbody {...tableInstance.getTableBodyProps()}>
                    {tableInstance.page.map(row => {
                        tableInstance.prepareRow(row)
                        return (
                            <tr {...row.getRowProps()}>
                                {row.cells.map(cell => {
                                    return (
                                        <td {...cell.getCellProps([getRowStyle(row.index, cell.column.isDimension)])}>
                                            {cell.render('Cell')}
                                        </td>
                                    )
                                })}
                            </tr>
                        )
                    })}
                    </tbody>
                </HTMLTable>
                {isTableDataLoading && (
                    <React.Fragment>
                        <div style={{paddingTop: '20px'}} />
                        <NonIdealState
                            title='Loading results'
                            icon={<Spinner/>}
                        />
                    </React.Fragment>
                )}
            </div>
            <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '10px',
                    }}>
                    <div>
                        {tableInstance.rows.length > 0
                            ? <CSVLink
                                role='button'
                                tabIndex={0}
                                className="bp3-button"
                                data={tableInstance.rows.map(row => row.values)}
                                filename={`lightdash-${activeTableName || 'export'}-${(new Date()).toISOString().slice(0, 10)}.csv`}
                                target='_blank'
                            >
                                <Icon icon={"export"} /><span>Export CSV</span>
                            </CSVLink>
                            : null
                        }
                    </div>
                    {tableInstance.pageCount > 1 && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'flex-end',
                            alignItems: 'center'
                        }}>
                            {tableInstance.canPreviousPage &&
                            <Button icon={'arrow-left'} onClick={tableInstance.previousPage}/>}
                            <span style={{
                                paddingRight: '5px',
                                paddingLeft: '5px'
                            }}>Page {tableInstance.state.pageIndex + 1} of {tableInstance.pageCount}</span>
                            {tableInstance.canNextPage &&
                            <Button icon={'arrow-right'} onClick={tableInstance.nextPage}/>}
                        </div>
                    )}
                </div>
        </div>
    )
}

const echartMap: {[key in Dimension['type'] | Metric['type']]: string} = {
    'date': 'time',
    'string': 'ordinal',
    'timestamp': 'time',
    'boolean': 'ordinal',
    'number': 'number',
    'max': 'number',
    'min': 'number',
    'count': 'number',
    'count_distinct': 'number',
    'sum': 'number',
    'average': 'number',
}

const pivot = (values: {[key: string]: any}[], indexKey: string, pivotKey: string, metricKey: string) => {
    return Object.values(values.reduce((acc, value) => {
        acc[value[indexKey]] = acc[value[indexKey]] || {[indexKey]: value[indexKey]}
        acc[value[indexKey]][value[pivotKey]] = value[metricKey]
        return acc
    }, {}))
}

const defaultEchartDimensions = (results: {[key: string]: any }[], dimensions: Dimension[], metrics: Metric[]) => {
    if (metrics.length === 0)
        return undefined
    switch (dimensions.length) {
        case 0:
            return undefined
        case 1:
            // With just one dimension: create a series per metric
            return {
                data: results,
                echartDimensions: [...dimensions, ...metrics].map(field => ({name: fieldId(field), displayName: `${friendlyName(field.table)} ${friendlyName(field.name)}`}))
            }
        case 2:
            // Two dimensions: pivot on the second dimension and only use the first metric
            const indexKey = fieldId(dimensions[0])
            const pivotKey = fieldId(dimensions[1])
            const metricKey = fieldId(metrics[0])
            const data = pivot(results, indexKey, pivotKey, metricKey)
            const seriesNames = [...new Set(results.map(r => r[pivotKey]))]
            return {
                data: data,
                echartDimensions: [
                    {
                        name: indexKey,
                        displayName: `${friendlyName(dimensions[0].table)} ${friendlyName(dimensions[0].name)}`
                    },
                    ...seriesNames.map(name => ({name: name, displayName: name}))
                ]
            }
        default:
            // Otherwise we only plot the first dimension and a series per metric
            const [first, ...rest] = dimensions
            return {
                data: results,
                echartDimensions: [
                    {
                        name: fieldId(first),
                        displayName: `${friendlyName(first.table)} ${friendlyName(first.name)}`,
                    },
                    ...metrics.map(field => ({name: fieldId(field), displayName: `${friendlyName(field.table)} ${friendlyName(field.name)}`}))
                ]
            }
    }
}

type ChartType = 'line' | 'column' | 'bar' | 'scatter'

const flipXFromChartType = (chartType: ChartType) => {
    switch (chartType) {
        case "column": return false
        case "bar": return true
        case "line": return false
        case "scatter": return false
        default:
            const nope: never = chartType
    }
}

const echartType = (chartType: ChartType) => {
    switch (chartType) {
        case "line": return 'line'
        case "bar": return 'bar'
        case "column": return 'bar'
        case "scatter": return 'scatter'
        default:
            const nope: never = chartType
    }
}

type SimpleChartProps = {
    results: {[key: string]: any}[],
    dimensions: Dimension[],
    metrics: Metric[],
    chartType: ChartType,
}
const SimpleChart = ({ results, dimensions, metrics, chartType }: SimpleChartProps) => {
    // Different behaviour depending on dimensions
    const plotData = defaultEchartDimensions(results, dimensions, metrics)
    if (!plotData)
        return <span>Can't plot</span>
    const flipX = flipXFromChartType(chartType)
    const [xdim, ...ydims] = plotData.echartDimensions
    const options = {
        dataset: {
            id: 'lightdashResults',
            source: plotData.data,
            dimensions: plotData.echartDimensions,
        },
        xAxis: {
            type: flipX ? 'value' : 'category',
            name: flipX ? ydims[0].displayName : xdim.displayName,
        },
        tooltip: {
            show: true,
            trigger: 'item',
        },
        yAxis: {
            type: flipX ? 'category' : 'value',
            name: flipX ? xdim.displayName : ydims[0].displayName,
        },
        series: ydims.map(d => ({type: echartType(chartType)})),
        legend: {
            show: ydims.length > 1 ? true : false,
        }
    }
    return <div style={{padding: 10}}>
        <EChartsReact option={options} notMerge={true}/>
    </div>
}