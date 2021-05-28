import {Explore, FieldId, FilterGroup, SortField} from "common";
import {Code, Pre} from "@blueprintjs/core";
import {buildQuery} from "../queryBuilder";
import React from "react";

type RenderedSqlProps = {
    explore: Explore | undefined,
    metrics: FieldId[],
    dimensions: FieldId[],
    sorts: SortField[],
    filters: FilterGroup[],
    limit: number
}
export const RenderedSql = ({explore, metrics, dimensions, sorts, filters, limit}: RenderedSqlProps) => (
    <Pre style={{borderRadius: '0', boxShadow: 'none'}}><Code>{explore ? buildQuery({
        explore,
        metrics,
        dimensions,
        sorts,
        filters,
        limit: limit
    }) : ''}</Code></Pre>
)