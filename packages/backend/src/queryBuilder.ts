import {
    Dimension,
    FilterGroup,
    Explore,
    ExploreJoin,
    fieldId,
    FilterGroupOperator,
    Metric,
    MetricQuery,
    StringFilter,
    StringDimension,
    NumberDimension,
    NumberFilter,
    getDimensions,
    fieldIdFromFilterGroup,
    FieldId, getMetrics,
} from "common";


const lightdashVariablePattern = /\$\{([a-zA-Z0-9_.]+)\}/g

const renderDimensionReference = (ref: string, explore: Explore, currentTable: string): string => {
    // Reference to current table
    if (ref === 'TABLE') {
        return currentTable
    }
    // Reference to another dimension
    const split = ref.split('.')
    if (split.length > 2) {
        throw new Error(`Model ${currentTable} has an illegal dimension reference: \${${ref}}`)
    }
    const refTable = split.length === 1 ? currentTable : split[0]
    const refName = split.length === 1 ? split[0] : split[1]
    const dimension = explore.tables[refTable]?.dimensions[refName]
    if (dimension === undefined)
        throw Error(`Model ${currentTable} has a dimension reference: \${${ref}} which matches no dimension`)
    return `(${renderDimensionSql(dimension, explore)})`
}

const renderMetricReference = (ref: string, explore: Explore, currentTable: string): string => {
    // Reference to current table
    if (ref === 'TABLE') {
        return currentTable
    }
    // Reference to another dimension
    const split = ref.split('.')
    if (split.length > 2) {
        throw new Error(`Model ${currentTable} has an illegal metric reference: \${${ref}}`)
    }
    const refTable = split.length === 1 ? currentTable : split[0]
    const refName = split.length === 1 ? split[0] : split[1]
    const metric = explore.tables[refTable]?.metrics[refName]
    if (metric === undefined)
        throw Error(`Model ${currentTable} has a metric reference: \${${ref}} which matches no metric`)
    return `(${renderMetricSql(metric, explore)})`
}

const renderMetricSql = (metric: Metric, explore: Explore): string => {
    // Metric might have references to other dimensions
    const renderedSql = metric.sql.replace(lightdashVariablePattern, (_, p1) => renderDimensionReference(p1, explore, metric.table))
    const metricType = metric.type
    switch(metricType) {
        case "average": return `AVG(${renderedSql})`
        case "count":   return `COUNT(${renderedSql})`
        case "count_distinct": return `COUNT(DISTINCT ${renderedSql})`
        case "max": return `MAX(${renderedSql})`
        case "min": return `MIN(${renderedSql})`
        case "sum": return `SUM(${renderedSql})`
        default:
            const nope: never = metricType
            throw Error(`No SQL render function implemented for metric with type ${metric.type}`)
    }
}


const renderDimensionSql = (dimension: Dimension, explore: Explore): string => {
    // Dimension might have references to other dimensions
    return dimension.sql.replace(lightdashVariablePattern, (_, p1) => renderDimensionReference(p1, explore, dimension.table))
}

const renderExploreJoinSql = (join: ExploreJoin, explore: Explore): string => {
    // Sql join contains references to dimensions
    return join.sqlOn.replace(lightdashVariablePattern, (_, p1) => renderDimensionReference(p1, explore, join.table))
}

const renderStringFilterSql = (dimension: StringDimension, filter: StringFilter, explore: Explore): string => {
    const dimensionSql = renderDimensionSql(dimension, explore)
    const filterType = filter.operator
    switch (filter.operator) {
        case "equals":
            return filter.values.length === 0 ? 'false' : `(${dimensionSql}) IN (${filter.values.map(v => `'${v}'`).join(',')})`
        case "notEquals":
            return filter.values.length === 0 ? 'true' : `(${dimensionSql}) NOT IN (${filter.values.map(v => `'${v}'`).join(',')})`
        case "isNull":
            return `(${dimensionSql}) IS NULL`
        case "notNull":
            return `(${dimensionSql}) IS NOT NULL`
        case "startsWith":
            return `(${dimensionSql}) LIKE '${filter.value}%'`
        default:
            const nope: never = filter
            throw Error(`No function implemented to render sql for filter type ${filterType} on dimension type ${dimension.type}`)
    }
}

const renderNumberFilterSql = (dimension: NumberDimension, filter: NumberFilter, explore: Explore): string => {
    const dimensionSql = renderDimensionSql(dimension, explore)
    const filterType = filter.operator
    switch (filter.operator) {
        case "equals":
            return filter.values.length === 0 ? 'false' : `(${dimensionSql}) IN (${filter.values.join(',')})`
        case "notEquals":
            return filter.values.length === 0 ? 'true' : `(${dimensionSql}) NOT IN (${filter.values.join(',')})`
        case "isNull":
            return `(${dimensionSql}) IS NULL`
        case "notNull":
            return `(${dimensionSql}) IS NOT NULL`
        case "greaterThan":
            return `(${dimensionSql}) > ${filter.value}`
        case "lessThan":
            return `(${dimensionSql}) < ${filter.value}`
        default:
            const nope: never = filter
            throw Error(`No function implemented to render sql for filter type ${filterType} on dimension type ${dimension.type}`)
    }
}

const renderFilterGroupSql = (filterGroup: FilterGroup, explore: Explore): string => {
    const operator = filterGroup.operator === FilterGroupOperator.or ? 'OR' : 'AND'
    const groupType = filterGroup.type
    const filterGroupFieldId = fieldIdFromFilterGroup(filterGroup)
    const dimension = getDimensions(explore).find(d => (fieldId(d) === filterGroupFieldId))
    switch (filterGroup.type) {
        case "string": {
            if (dimension?.type === 'string')
                return filterGroup.filters.map(filter => renderStringFilterSql(dimension, filter, explore)).join(`\n   ${operator} `)
            throw new Error(`StringFilterGroup has a reference to an unknown string field ${fieldIdFromFilterGroup(filterGroup)}`)
        }
        case "number":
            if (dimension?.type === 'number')
                return filterGroup.filters.map(filter => renderNumberFilterSql(dimension, filter, explore)).join(`\n   ${operator} `)
            throw new Error(`NumberFilterGroup has a reference to an unknown number field ${fieldIdFromFilterGroup(filterGroup)}`)
        default:
            const nope: never = filterGroup
            throw Error(`No function implemented to render sql for filter group type ${groupType}`)

    }
}

const getDimensionFromId = (dimId: FieldId, explore: Explore) => {
    const dimensions = getDimensions(explore)
    const dimension = dimensions.find(d => fieldId(d) === dimId)
    if (dimension === undefined)
        throw new Error(`Tried to reference dimension with unknown field id: ${dimId}`)
    return dimension
}

const getMetricFromId = (metricId: FieldId, explore: Explore) => {
    const metrics = getMetrics(explore)
    const metric = metrics.find(m => fieldId(m) === metricId)
    if (metric === undefined)
        throw new Error(`Tried to reference metric with unknown field id ${metricId}`)
    return metric
}


export type BuildQueryProps = {
    explore: Explore,
    metricQuery: MetricQuery,
}
export const buildQuery = ({ explore, metricQuery }: BuildQueryProps) => {
    const {
        dimensions,
        metrics,
        filters,
        sorts,
        limit
    } = metricQuery
    const baseTable = explore.tables[explore.baseTable].sqlTable
    const sqlFrom = `FROM ${baseTable} AS ${explore.baseTable}`
    const q = baseTable.slice(0, 1)  // quote char

    const sqlJoins = explore.joinedTables.map(join => {
        const joinTable = explore.tables[join.table].sqlTable
        const alias = join.table
        return `LEFT JOIN ${joinTable} AS ${alias}\n  ON ${renderExploreJoinSql(join, explore)}`
    }).join('\n')

    const dimensionSelects = dimensions.map(field => {
        const alias = field
        const dimension = getDimensionFromId(field, explore)
        return `  ${renderDimensionSql(dimension, explore)} AS ${q}${alias}${q}`
    })

    const metricSelects = metrics.map(field => {
        const alias = field
        const metric = getMetricFromId(field, explore)
        return `  ${renderMetricSql(metric, explore)} AS ${q}${alias}${q}`
    })

    const sqlSelect = `SELECT\n${[...dimensionSelects, ...metricSelects].join(',\n')}`
    const sqlGroupBy = dimensionSelects.length > 0 ? `GROUP BY ${dimensionSelects.map((val, i) => i+1).join(',')}`: ''

    const fieldOrders = sorts.map(sort => `${sort.fieldId}${sort.descending ? ' DESC' : ''}`)
    const sqlOrderBy = fieldOrders.length > 0 ? `ORDER BY ${fieldOrders.join(', ')}` : ''

    const whereFilters = filters.map(filter => renderFilterGroupSql(filter, explore))
    const sqlWhere = whereFilters.length > 0 ? `WHERE ${whereFilters.map(w => `(\n  ${w}\n)`).join(' AND ')}` : ''


    const sqlLimit = `LIMIT ${limit}`

    const sql = [sqlSelect, sqlFrom, sqlJoins, sqlWhere, sqlGroupBy, sqlOrderBy, sqlLimit].join('\n')
    return sql
}
