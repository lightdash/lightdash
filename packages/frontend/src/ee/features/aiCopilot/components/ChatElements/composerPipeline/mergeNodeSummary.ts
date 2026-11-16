import {
    friendlyName,
    getItemId,
    MERGE_TABLE_NAME,
    type MergeJoinType,
    type MergeSourceQuery,
} from '@lightdash/common';

/** What the UI knows about one merged node; null fields when it is not in the pipeline. */
export type MergeSourceInfo = {
    title: string;
    exploreName: string | null;
};

export type MergeColumn = {
    label: string;
    /** The step the column comes from; null for a join key or calculation. */
    sourceTitle: string | null;
    sourceNodeId: string | null;
};

export type MergeFormulaToken =
    | { kind: 'text'; text: string }
    | { kind: 'column'; column: MergeColumn };

export type MergeNodeSummary = {
    sources: {
        nodeId: string;
        title: string;
        exploreName: string | null;
        repeatValues: boolean;
        /** This source's dimension for each key part, in key order. */
        keyFields: { fieldId: string; label: string }[];
    }[];
    keys: {
        name: string;
        /** The key's first listed field, as the merged result labels it. */
        label: string;
    }[];
    /** All key parts in one phrase, e.g. "Order week + Status". */
    keyLabel: string;
    joinType: MergeJoinType;
    firstSourceTitle: string;
    calculations: {
        name: string;
        displayName: string;
        formula: MergeFormulaToken[];
    }[];
    sorts: { column: MergeColumn; descending: boolean }[];
    limit: number | null;
};

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;

/** Splits a formula into text and the merged columns it references. */
const tokenizeMergeFormula = (
    formula: string,
    columnOf: (mergedColumnId: string) => MergeColumn | null,
): MergeFormulaToken[] => {
    const body = formula.trim().replace(/^=\s*/, '');
    const tokens: MergeFormulaToken[] = [];
    let cursor = 0;
    const pushText = (text: string) => {
        if (!text) return;
        const last = tokens[tokens.length - 1];
        if (last?.kind === 'text') last.text += text;
        else tokens.push({ kind: 'text', text });
    };
    for (const match of body.matchAll(IDENTIFIER)) {
        const column = columnOf(match[0]);
        if (!column) continue;
        pushText(body.slice(cursor, match.index));
        tokens.push({ kind: 'column', column });
        cursor = match.index + match[0].length;
    }
    pushText(body.slice(cursor));
    return tokens;
};

/**
 * A merge node in display terms: node ids resolved to step titles and
 * merged column ids to field labels, so nothing internal reaches the UI.
 */
export const summarizeMergeNode = (
    node: MergeSourceQuery,
    sourceInfoById: Readonly<Record<string, MergeSourceInfo | undefined>>,
    fieldLabel: (sourceNodeId: string, fieldId: string) => string,
): MergeNodeSummary => {
    const titleOf = (nodeId: string) =>
        sourceInfoById[nodeId]?.title ?? friendlyName(nodeId);
    const sources = node.sources.map(({ nodeId, repeatValues }) => ({
        nodeId,
        title: titleOf(nodeId),
        exploreName: sourceInfoById[nodeId]?.exploreName ?? null,
        repeatValues: !!repeatValues,
        keyFields: node.joinKey.flatMap((part) => {
            const fieldId = part.fieldIdBySourceId[nodeId];
            return fieldId
                ? [{ fieldId, label: fieldLabel(nodeId, fieldId) }]
                : [];
        }),
    }));

    // Same rule as the merged result's key column, so the sentence and table agree
    const keys = node.joinKey.map((part) => {
        const [first] = Object.entries(part.fieldIdBySourceId);
        return {
            name: part.name,
            label: first
                ? fieldLabel(first[0], first[1])
                : friendlyName(part.name),
        };
    });

    // Longest id first: `orders_2_x` must not resolve through `orders_`
    const sourceIds = sources
        .map(({ nodeId }) => nodeId)
        .sort((a, b) => b.length - a.length);
    const calculationNames = new Map(
        (node.tableCalculations ?? []).map((calc) => [
            getItemId({ table: MERGE_TABLE_NAME, name: calc.name }),
            calc.displayName,
        ]),
    );
    const keyLabels = new Map(
        keys.map((key) => [
            getItemId({ table: MERGE_TABLE_NAME, name: key.name }),
            key.label,
        ]),
    );
    const columnOf = (mergedColumnId: string): MergeColumn | null => {
        const keyLabel = keyLabels.get(mergedColumnId);
        if (keyLabel !== undefined)
            return { label: keyLabel, sourceTitle: null, sourceNodeId: null };
        const calcLabel = calculationNames.get(mergedColumnId);
        if (calcLabel !== undefined)
            return { label: calcLabel, sourceTitle: null, sourceNodeId: null };
        const owner = sourceIds.find((id) =>
            mergedColumnId.startsWith(`${id}_`),
        );
        if (!owner) return null;
        return {
            label: fieldLabel(owner, mergedColumnId.slice(owner.length + 1)),
            sourceTitle: titleOf(owner),
            sourceNodeId: owner,
        };
    };

    return {
        sources,
        keys,
        keyLabel: keys.map((key) => key.label).join(' + '),
        joinType: node.joinType,
        firstSourceTitle: sources[0]?.title ?? '',
        calculations: (node.tableCalculations ?? []).map((calc) => ({
            name: calc.name,
            displayName: calc.displayName,
            formula: tokenizeMergeFormula(calc.formula ?? calc.sql, columnOf),
        })),
        sorts: (node.sorts ?? []).map((sort) => ({
            column: columnOf(sort.fieldId) ?? {
                label: friendlyName(sort.fieldId),
                sourceTitle: null,
                sourceNodeId: null,
            },
            descending: sort.descending,
        })),
        limit: node.limit ?? null,
    };
};
