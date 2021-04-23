import {Dimension, Direction, Explore, Measure, MeasureType, SortField} from "common";

type BuildQueryProps = {
    explore: Explore,
    dimensions: Dimension[],
    measures: Measure[],
    sorts: SortField[],
}

export const refFromName = (name: string) => name.toLowerCase().split(' ').join('_')

const measureSql = (relationRef: string, measure: Measure) => {
         if (measure.type === MeasureType.max)           return `MAX(${relationRef}.${measure.column})`
    else if (measure.type === MeasureType.min)           return `MIN(${relationRef}.${measure.column})`
    else if (measure.type === MeasureType.count)         return `COUNT(${relationRef}.${measure.column})`
    else if (measure.type === MeasureType.countDistinct) return `COUNT(DISTINCT ${relationRef}.${measure.column})`
    else if (measure.type === MeasureType.average)       return `AVG(${relationRef}.${measure.column})`
    else if (measure.type === MeasureType.sum)           return `SUM(${relationRef}.${measure.column})`
    else throw Error(`Measure type ${measure.type} not supported`)
}

export const buildQuery = ({explore, dimensions, measures, sorts}: BuildQueryProps) => {
    const baseRef = refFromName(explore.baseRelation)
    const baseTable = explore.relations[explore.baseRelation].table
    const sqlFrom = `FROM ${baseTable} AS ${baseRef}`
    const sqlJoins = explore.joinedRelations.map(join => {
        const joinRef = refFromName(join.relation)
        const joinTable = explore.relations[join.relation].table
        return `LEFT JOIN ${joinTable} AS ${joinRef}\n  ON ${baseRef}.${join.leftColumn} = ${joinRef}.${join.rightColumn}`
    })

    const dimensionSelects = dimensions.map(dimension => {
        const relationRef = refFromName(dimension.relation)
        return `  ${relationRef}.${dimension.column} AS \`${relationRef}_${refFromName(dimension.name)}\``
    })
    const measureSelects = measures.map(measure => {
        const relationRef = refFromName(measure.relation)
        return `  ${measureSql(relationRef, measure)} AS \`${relationRef}_${refFromName(measure.name)}\``
    })
    const sqlSelect = `SELECT\n${[...dimensionSelects, measureSelects].join(',\n')}`
    const sqlGroupBy = dimensionSelects.length > 0 ? `GROUP BY ${dimensionSelects.map((val, i) => i+1).join(',')}`: ''

    const fieldOrders = sorts.map(sort => `${sort.field.relation}_${refFromName(sort.field.name)}${sort.direction === Direction.descending ? ' DESC' : ''}`)
    const sqlOrderBy = fieldOrders.length > 0 ? `ORDER BY ${fieldOrders.join(', ')}` : ''

    const sqlLimit = 'LIMIT 500'

    const sql = [sqlSelect, sqlFrom, sqlJoins, sqlGroupBy, sqlOrderBy, sqlLimit].join('\n')
    return sql
}