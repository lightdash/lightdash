import {Code, Pre} from "@blueprintjs/core";
import React from "react";
import {useSqlQuery} from "../hooks/useSqlQuery";

export const RenderedSql = () => {
    const { renderedSql } = useSqlQuery()
    const text = renderedSql === undefined ? '' : renderedSql
    return (
        <Pre style={{borderRadius: '0', boxShadow: 'none'}}><Code>{text}</Code></Pre>
    )
}