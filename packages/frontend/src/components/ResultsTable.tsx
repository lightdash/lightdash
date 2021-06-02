import {useExploreConfig} from "../hooks/useExploreConfig";
import {usePagination, useTable as useReactTable} from "react-table";
import {Button, Colors, HTMLTable, Icon, NonIdealState, Spinner, Tag} from "@blueprintjs/core";
import {DimensionType} from "common";
import React from "react";
import {CSVLink} from "react-csv";
import {useColumns} from "../hooks/useColumns";
import {useTable} from "../hooks/useTable";
import {RefreshButton} from "./RefreshButton";
import {useQueryResults} from "../hooks/useQueryResults";

const hexToRGB = (hex: string, alpha: number) => {
    const h = parseInt('0x' + hex.substring(1))
    const r = (h >> 16) & 0xFF
    const g = (h >> 8) & 0xFF
    const b = (h & 0xFF)
    return `rgb(${r}, ${g}, ${b}, ${alpha})`
}

const EmptyStateNoColumns = () => (
    <div style={{padding: '50px 0'}}>
        <NonIdealState
            title="Select fields to explore"
            description="Get started by selecting metrics and dimensions."
            icon='hand-left'
        />
    </div>
)

const EmptyStateNoTableData = () => {
    return (
        <div style={{padding: '50px 0'}}>
            <NonIdealState
                description="Click run query to see your results"
                action={<RefreshButton />}
            />
        </div>
    )
}

const EmptyStateExploreLoading = () => (
    <NonIdealState
        title='Loading tables'
        icon={<Spinner/>}
    />
)

const EmptyStateNoRows = () => (
    <NonIdealState
        title='Query returned no results'
        description='This query ran successfully but returned no results'
    />
)

export const ResultsTable = () => {
    const columns = useColumns()
    const {activeTableName} = useExploreConfig()
    const activeExplore = useTable()
    const queryResults = useQueryResults()
    const safeData = React.useMemo(() => queryResults.status === 'success' ? queryResults.data : [], [queryResults.status, queryResults.data])

    const tableInstance = useReactTable({
        columns: columns,
        data: safeData,
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

    if (activeExplore.isLoading)
        return <EmptyStateExploreLoading />

    if (tableInstance.columns.length === 0)
        return <EmptyStateNoColumns />

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
        <div style={{
            height: '100%',
            padding: '10px',
            minHeight: '500px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
        }}>
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
                {queryResults.isLoading && (
                    <React.Fragment>
                        <div style={{paddingTop: '20px'}}/>
                        <NonIdealState
                            title='Loading results'
                            icon={<Spinner/>}
                        />
                    </React.Fragment>
                )}
                {queryResults.isIdle && (
                    <EmptyStateNoTableData />
                )}
                {queryResults.status === 'success' && queryResults.data.length === 0 && (
                    <EmptyStateNoRows />
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
                            <Icon icon={"export"}/><span>Export CSV</span>
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