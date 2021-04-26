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
    leftJoinKey: string[],
    rightJoinKey: string[],
}

export type Field = {
    name: string,
    relation: string,
}

export enum DimensionType {
    string = 'string',
    timestamp = 'timestamp',
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

export const mapColumnTypeToSeekerType = (columnType: string): DimensionType => {
    return seekerTypeMap[columnType] || DimensionType.string
}


const seekerTypeMap: {[columnType: string]: DimensionType} = {
    'INTEGER':   DimensionType.number,
    'FLOAT':     DimensionType.number,
    'NUMERIC':   DimensionType.number,
    'BOOLEAN':   DimensionType.boolean,
    'STRING':    DimensionType.string,
    'TIMESTAMP': DimensionType.timestamp,
    'DATETIME':  DimensionType.string,
    'DATE':      DimensionType.date,
    'TIME':      DimensionType.string,
    'BOOL':      DimensionType.boolean,
    'ARRAY':     DimensionType.string,
    'GEOGRAPHY': DimensionType.string,
    'NUMBER': DimensionType.number,
    'DECIMAL': DimensionType.number,
    'INT': DimensionType.number,
    'BIGINT': DimensionType.number,
    'SMALLINT': DimensionType.number,
    'FLOAT4': DimensionType.number,
    'FLOAT8': DimensionType.number,
    'DOUBLE': DimensionType.number,
    'DOUBLE PRECISION': DimensionType.number,
    'REAL': DimensionType.number,
    'VARCHAR': DimensionType.string,
    'CHAR': DimensionType.string,
    'CHARACTER': DimensionType.string,
    'TEXT': DimensionType.string,
    'BINARY': DimensionType.string,
    'VARBINARY': DimensionType.string,
    'TIMESTAMP_NTZ': DimensionType.timestamp,
    'VARIANT': DimensionType.string,
    'OBJECT': DimensionType.string,
    'INT2': DimensionType.number,
    'INT4': DimensionType.number,
    'INT8': DimensionType.number,
    'NCHAR': DimensionType.string,
    'BPCHAR': DimensionType.string,
    'CHARACTER VARYING': DimensionType.string,
    'NVARCHAR': DimensionType.string,
    'TIMESTAMP WITHOUT TIME ZONE': DimensionType.timestamp,
    'GEOMETRY': DimensionType.string,
    'TIME WITHOUT TIME ZONE': DimensionType.string,
    'XML': DimensionType.string,
    'UUID': DimensionType.string,
    'PG_LSN': DimensionType.string,
    'MACADDR': DimensionType.string,
    'JSON': DimensionType.string,
    'JSONB': DimensionType.string,
    'CIDR': DimensionType.string,
    'INET': DimensionType.string,
    'MONEY': DimensionType.number,
    'SMALLSERIAL': DimensionType.number,
    'SERIAL2': DimensionType.number,
    'SERIAL': DimensionType.number,
    'SERIAL4': DimensionType.number,
    'BIGSERIAL': DimensionType.number,
    'SERIAL8': DimensionType.number,
}
// # TIMETZ not supported
// # TIME WITH TIME ZONE not supported
// # TIMESTAMP_LTZ not supported (see https://docs.looker.com/reference/field-params/dimension_group)
//     # TIMESTAMP_TZ not supported (see https://docs.looker.com/reference/field-params/dimension_group)
//     # HLLSKETCH not supported
// # TIMESTAMPTZ not supported
// # TIMESTAMP WITH TIME ZONE not supported
// # BIT, BIT VARYING, VARBIT not supported
// # BOX not supported
// # BYTEA not supported
// # CIRCLE not supported
// # INTERVAL not supported
// # LINE not supported
// # LSEG not supported
// # PATH not supported
// # POINT not supported
// # POLYGON not supported
// # TSQUERY, TSVECTOR not supported
// # TIMESTAMPTZ not supported
// # TIMESTAMP WITH TIME ZONE not supported
// # TIMETZ not supported
// # HLLSKETCH not supported
// # TIME WITH TIME ZONE not supported
