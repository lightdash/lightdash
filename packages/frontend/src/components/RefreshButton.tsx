import {useExploreConfig} from "../hooks/useExploreConfig";
import {Button} from "@blueprintjs/core";
import React from "react";
import {useQueryResults} from "../hooks/useQueryResults";

export const RefreshButton = () => {
    const {validQuery} = useExploreConfig()
    const {refetch, isFetching} = useQueryResults()
    return (
        <Button
            intent={"primary"}
            style={{height: '40px', width: 150, marginRight: '10px'}}
            onClick={() => refetch()}
            disabled={!validQuery}
            loading={isFetching}
        >
            Run query
        </Button>
    )
}