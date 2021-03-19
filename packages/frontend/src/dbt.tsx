import {SeekerDimension, SeekerMeasure, SeekerView} from "./seekerTypes";
import rawManifest from "./manifest.json";

type DbtNode = {
    unique_id: string
    resource_type: string,
}
type DbtModelNode = DbtNode & {
    columns: { [name: string]: DbtModelColumn },
    meta: DbtModelMetadata,
    database: string,
    schema: string,
    name: string,
}
type DbtModelMetadata = {
    "seeker.io"?: DbtModelSeekerConfig
}
type DbtModelSeekerConfig = {
    name?: string,
    dimensions: DbtModelSeekerDimensionConfig[],
    measures: DbtModelSeekerMeasureConfig[]
}
type DbtModelSeekerDimensionConfig = {
    name: string,
    description?: string,
    sql: string,
}
type DbtModelSeekerMeasureConfig = {
    name: string,
    description?: string,
    type: string,
    sql: string,
}
type DbtModelColumn = {
    name: string,
    description?: string,
    meta: DbtColumnMetadata
}
type DbtColumnMetadata = {
    "seeker.io"?: DbtColumnSeekerConfig,
}
type DbtColumnSeekerConfig = {
    dimensions: DbtColumnSeekerDimensionConfig[],
    measures: DbtColumnSeekerMeasureConfig[],
}
type DbtColumnSeekerDimensionConfig = {
    name: string
}
type DbtColumnSeekerMeasureConfig = {
    name: string,
    type: string,
}
export const loadModelNodes = (): DbtModelNode[] => {
    return Object.values(rawManifest.nodes).filter(node => node.resource_type === "model") as DbtModelNode[]
}
const translateDbtModelMeasure = (model: DbtModelNode, measure: DbtModelSeekerMeasureConfig): SeekerMeasure => ({
    database: model.database,
    schema: model.schema,
    tableName: model.name,
    id: `${model.unique_id}.${measure.name}`,
    name: measure.name,
    description: measure.description || "",
    sql: measure.sql,
    type: measure.type,
})
const translateDbtModelDimension = (model: DbtModelNode, dimension: DbtModelSeekerDimensionConfig): SeekerDimension => ({
    id: `${model.unique_id}.${dimension.name}`,
    database: model.database,
    schema: model.schema,
    tableName: model.name,
    name: dimension.name,
    description: dimension.description || "",
    sql: dimension.sql,
})
const translateDbtColumnMeasure = (model: DbtModelNode, column: DbtModelColumn, measure: DbtColumnSeekerMeasureConfig): SeekerMeasure => ({
    id: `${model.unique_id}.${measure.name}`,
    database: model.database,
    schema: model.schema,
    tableName: model.name,
    name: measure.name,
    sql: column.name,
    type: measure.type,
    description: column.description || "",
})
const translateDbtColumnDimension = (model: DbtModelNode, column: DbtModelColumn, dimension: DbtColumnSeekerDimensionConfig): SeekerDimension => ({
    id: `${model.unique_id}.${dimension.name}`,
    database: model.database,
    schema: model.schema,
    tableName: model.name,
    name: dimension.name,
    description: column.description || "",
    sql: column.name,
})

export const translateDbtModelToSeekerView = (model: DbtModelNode): SeekerView => {
    const modelDimensions = (model.meta["seeker.io"]?.dimensions || [])
        .map(dim => translateDbtModelDimension(model, dim))
        .map(dim => [dim.id, dim])
    const columnDimensions = Object.values(model.columns).flatMap(
        column => (column.meta["seeker.io"]?.dimensions || []).map(
            dim => translateDbtColumnDimension(model, column, dim)
        )
            .map(dim => [dim.id, dim])
    )
    const dimensions = {...Object.fromEntries(modelDimensions), ...Object.fromEntries(columnDimensions)}

    const modelMeasures = (model.meta["seeker.io"]?.measures || [])
        .map(measure => translateDbtModelMeasure(model, measure))
        .map(measure => [measure.id, measure])
    const columnMeasures = Object.values(model.columns).flatMap(
        column => (column.meta["seeker.io"]?.measures || []).map(
            measure => translateDbtColumnMeasure(model, column, measure)
        )
            .map(measure => [measure.id, measure])
    )
    const measures = {...Object.fromEntries(modelMeasures), ...Object.fromEntries(columnMeasures)}

    return {
        id: model.unique_id,
        database: model.database,
        schema: model.schema,
        tableName: model.name,
        name: model.meta["seeker.io"]?.name || model.name,
        dimensions: dimensions,
        measures: measures,
    }
}