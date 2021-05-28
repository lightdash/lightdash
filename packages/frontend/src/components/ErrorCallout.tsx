import {Callout} from "@blueprintjs/core";
import React from "react";
import {useExploreConfig} from "../hooks/useExploreConfig";

export const ErrorCallout = () => {
    const { error } = useExploreConfig()
    if (error === undefined)
        return null
    return (
        <Callout
            style={{marginBottom: '20px'}}
            intent={'danger'}
            title={error.title}
        >
            {error.text.split('\n').map((line, idx) => <p key={idx}>{line}</p>)}
        </Callout>
    )
}
