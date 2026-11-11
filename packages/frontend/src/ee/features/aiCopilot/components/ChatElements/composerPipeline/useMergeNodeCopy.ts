import {
    assertUnreachable,
    interpolateUiString,
    MergeJoinType,
} from '@lightdash/common';
import { useCallback } from 'react';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import { type MergeNodeSummary } from './mergeNodeSummary';

/** Join type and repeat wording, as the Explorer's merge bar phrases them. */
export const useMergeNodeCopy = () => {
    const getUiString = useUiStrings();
    const joinTypeLabel = useCallback(
        (summary: MergeNodeSummary) => {
            const vars = { source: summary.firstSourceTitle };
            switch (summary.joinType) {
                case MergeJoinType.INNER:
                    return getUiString(
                        'aiAgent.composer.mergeNode.joinType.inner',
                    );
                case MergeJoinType.LEFT:
                    return interpolateUiString(
                        getUiString('aiAgent.composer.mergeNode.joinType.left'),
                        vars,
                    );
                case MergeJoinType.FULL:
                    return getUiString(
                        'aiAgent.composer.mergeNode.joinType.full',
                    );
                default:
                    return assertUnreachable(
                        summary.joinType,
                        'Unknown join type',
                    );
            }
        },
        [getUiString],
    );
    const joinTypeHelp = useCallback(
        (summary: MergeNodeSummary) => {
            const vars = {
                key: summary.keyLabel,
                source: summary.firstSourceTitle,
            };
            switch (summary.joinType) {
                case MergeJoinType.INNER:
                    return interpolateUiString(
                        getUiString(
                            'aiAgent.composer.mergeNode.joinTypeHelp.inner',
                        ),
                        vars,
                    );
                case MergeJoinType.LEFT:
                    return interpolateUiString(
                        getUiString(
                            'aiAgent.composer.mergeNode.joinTypeHelp.left',
                        ),
                        vars,
                    );
                case MergeJoinType.FULL:
                    return interpolateUiString(
                        getUiString(
                            'aiAgent.composer.mergeNode.joinTypeHelp.full',
                        ),
                        vars,
                    );
                default:
                    return assertUnreachable(
                        summary.joinType,
                        'Unknown join type',
                    );
            }
        },
        [getUiString],
    );
    const repeatsHelp = useCallback(
        (summary: MergeNodeSummary, nodeId: string) =>
            interpolateUiString(
                getUiString('aiAgent.composer.mergeNode.repeatsValuesHelp'),
                {
                    others: summary.sources
                        .filter((source) => source.nodeId !== nodeId)
                        .map((source) => source.title)
                        .join(', '),
                    key: summary.keyLabel,
                },
            ),
        [getUiString],
    );
    return { joinTypeLabel, joinTypeHelp, repeatsHelp };
};
