export type SeekerViewColumn = {
    database: string,
    schema: string,
    tableName: string,
    id: string,
    name: string
    description: string,
}
export type SeekerMeasure = SeekerViewColumn & {
    sql: string
    type: string
}
export type SeekerDimension = SeekerViewColumn & {
    sql: string
}
export type SeekerView = {
    id: string,
    database: string,
    schema: string,
    tableName: string,
    name: string,
    dimensions: { [id: string]: SeekerDimension },
    measures: { [id: string]: SeekerMeasure },
}