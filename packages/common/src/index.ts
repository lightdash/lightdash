export enum Direction {
    ascending = 'ascending',
    descending = 'descending',
}

export type SortField = {
    field: Field,
    direction: Direction,
}

export type Explore = {
    name: string,
    baseRelation: string,
    joinedRelations: ExploreJoin[],
    relations: {[name: string]: Relation}
}

export type ExploreFieldKey = {
    relation: string,
    name: string
}

export const fieldId = (field: Field): string => `${field.relation}.${field.name}`

export const getDimensions = (explore: Explore) => (
    Object.values(explore.relations).flatMap(r => Object.values(r.dimensions))
)

export const getMeasures = (explore: Explore) => (
    Object.values(explore.relations).flatMap(r => Object.values(r.measures))
)

export type Relation = {
    name: string,
    description: string,
    table: string,
    dimensions: {[name: string]: Dimension},
    measures: {[name: string]: Measure},
}

type ExploreJoin = {
    relation: string,
    leftColumn: string,
    rightColumn: string,
}

export type Field = {
    name: string,
    relation: string,
}

export enum DimensionType {
    string = 'string',
    time = 'time',
    number = 'number',
    boolean = 'boolean',
    date = 'date',
}

export type Dimension = Field & {
    column: string,
    type: DimensionType,
    description?: string,
}

export enum MeasureType {
    average = 'average',
    count = 'count',
    countDistinct = 'countDistinct',
    max = 'max',
    min = 'min',
    sum = 'sum',
}

export type Measure = Field & {
    column: string,
    type: MeasureType,
    description?: string,
}
