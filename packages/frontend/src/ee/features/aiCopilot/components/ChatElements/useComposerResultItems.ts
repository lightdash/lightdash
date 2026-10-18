import {
    buildResultColumnItems,
    type QueryNodeId,
    type ResultColumns,
    type SourceQuery,
} from '@lightdash/common';
import { useMemo } from 'react';

/** The items a node result charts as, keyed by `<nodeId>_<column>`. */
export const useComposerResultItems = (
    columns: ResultColumns | undefined,
    node: Pick<SourceQuery, 'nodeId' | 'title'> | null,
    nodeId: QueryNodeId,
) =>
    useMemo(
        () =>
            columns
                ? buildResultColumnItems(columns, {
                      table: nodeId,
                      tableLabel: node?.title ?? nodeId,
                  })
                : null,
        [columns, node?.title, nodeId],
    );
