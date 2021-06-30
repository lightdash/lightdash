import {Code, Pre} from "@blueprintjs/core";
import React from "react";
import {useCompliedSql} from "../hooks/useCompiledSql";

export const RenderedSql = () => {
    const { data } = useCompliedSql()
    const text = data === undefined ? '' : data
    return (
        <Pre style={{borderRadius: '5px', boxShadow: 'none', backgroundColor: '#f5f8fa', margin: '10px'}}><Code>{text}</Code></Pre>
    )
}