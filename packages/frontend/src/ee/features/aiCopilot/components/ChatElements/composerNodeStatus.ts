import {
    hasReachedSourceQueryLimit,
    interpolateUiString,
    type SourceQuery,
    type UiStringKey,
} from '@lightdash/common';
import { useCallback } from 'react';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';

/** Where one pipeline node is in a run, as shown in the tool-call card and the pipeline panel. */
export type ComposerNodeStatus =
    | 'pending'
    | 'awaiting_approval'
    | 'running'
    | 'success'
    | 'error';

/**
 * Live status of one node in the tool-call card, from the composer tool's
 * step-progress events. An absent map (post-run view) shows no indicators.
 */
export type ComposerQueryNodeStatus = { status: ComposerNodeStatus };

const NODE_STATUS_LABEL_KEYS = {
    pending: 'aiAgent.composer.nodeStatus.pending',
    awaiting_approval: 'aiAgent.composer.nodeStatus.awaitingApproval',
    running: 'aiAgent.composer.nodeStatus.running',
    success: 'aiAgent.composer.nodeStatus.success',
    error: 'aiAgent.composer.nodeStatus.error',
} as const satisfies Record<ComposerNodeStatus, UiStringKey>;

export const useComposerNodeStatusLabel = () => {
    const uiStrings = useUiStrings();
    return useCallback(
        (status: ComposerNodeStatus) =>
            uiStrings(NODE_STATUS_LABEL_KEYS[status]),
        [uiStrings],
    );
};

/** "1,000 rows", marked when the node returned its limit of rows. */
export const useComposerNodeRowsLabel = () => {
    const uiStrings = useUiStrings();
    return useCallback(
        (query: SourceQuery, rowCount: number) => {
            const rows = interpolateUiString(
                uiStrings(
                    rowCount === 1
                        ? 'aiAgent.composer.semanticNode.rows.singular'
                        : 'aiAgent.composer.semanticNode.rows.plural',
                ),
                { count: rowCount.toLocaleString() },
            );
            return hasReachedSourceQueryLimit(query, rowCount)
                ? interpolateUiString(
                      uiStrings('aiAgent.composer.node.rowsReachedLimit'),
                      { rows },
                  )
                : rows;
        },
        [uiStrings],
    );
};
