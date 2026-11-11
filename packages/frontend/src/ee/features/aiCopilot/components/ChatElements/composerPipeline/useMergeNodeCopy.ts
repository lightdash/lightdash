import {
    interpolateUiString,
    MergeJoinType,
    type UiStringKey,
} from '@lightdash/common';
import { useCallback } from 'react';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import { type MergeNodeSummary } from './mergeNodeSummary';

const JOIN_TYPE_KEYS = {
    [MergeJoinType.INNER]: {
        label: 'aiAgent.composer.mergeNode.joinType.inner',
        help: 'aiAgent.composer.mergeNode.joinTypeHelp.inner',
    },
    [MergeJoinType.LEFT]: {
        label: 'aiAgent.composer.mergeNode.joinType.left',
        help: 'aiAgent.composer.mergeNode.joinTypeHelp.left',
    },
    [MergeJoinType.FULL]: {
        label: 'aiAgent.composer.mergeNode.joinType.full',
        help: 'aiAgent.composer.mergeNode.joinTypeHelp.full',
    },
} as const satisfies Record<
    MergeJoinType,
    { label: UiStringKey; help: UiStringKey }
>;

/** Join type and repeat wording, as the Explorer's merge bar phrases them. */
export const useMergeNodeCopy = () => {
    const getUiString = useUiStrings();
    const joinTypeLabel = useCallback(
        (summary: MergeNodeSummary) =>
            interpolateUiString(
                getUiString(JOIN_TYPE_KEYS[summary.joinType].label),
                { source: summary.firstSourceTitle },
            ),
        [getUiString],
    );
    const joinTypeHelp = useCallback(
        (summary: MergeNodeSummary) =>
            interpolateUiString(
                getUiString(JOIN_TYPE_KEYS[summary.joinType].help),
                { key: summary.keyLabel, source: summary.firstSourceTitle },
            ),
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
