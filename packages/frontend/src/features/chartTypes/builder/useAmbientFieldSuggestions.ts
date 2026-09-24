import {
    type ApiAppVersionSummary,
    getItemId,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type SuggestedChartTypeField,
    type SuggestedChartTypeFieldAlternative,
} from '@lightdash/common';
import { useEffect, useMemo, useRef, useState } from 'react';
import { suggestChartTypeFields } from '../../../ee/features/ambientAi/hooks/useChartTypeSuggestions';
import { poolKeyForSlot } from '../utils/autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from '../utils/getDataAppVizFieldItems';
import { type LoadedExplore } from './useExplorePreviewData';

/** What the author asked for, as the suggestions are told it. */
export type ChartTypePromptContext = {
    prompt: string;
    /** Clarification answers, in the order they were asked. */
    clarifications: string[];
};

/** An input the model bound, and why. */
export type AiFieldPick = {
    fieldIds: string[];
    reason: string;
    alternatives: SuggestedChartTypeFieldAlternative[];
};

type SourceSuggestions = {
    sourceKey: string;
    /** Inputs already asked about for this source, answered or not. */
    askedFieldNames: string[];
    picks: Record<string, AiFieldPick>;
};

export type AmbientFieldSuggestions = {
    /** Inputs waiting on an answer; the query holds meanwhile. */
    pendingFieldNames: ReadonlySet<string>;
    /** The model's bindings, valid against the attached explore. */
    seed: DataAppVizFieldMapping;
    picks: Record<string, AiFieldPick>;
};

const NO_PENDING: ReadonlySet<string> = new Set();

/**
 * The prompt and clarification answers behind the version on screen. A
 * version without a prompt (an example, a restore) sends an empty one.
 */
export const getChartTypePromptContext = (
    versions: ApiAppVersionSummary[],
    version: number | null,
): ChartTypePromptContext => {
    const shown = versions.find((candidate) => candidate.version === version);
    // Only a first build asks clarifying questions; later versions refine it.
    const clarifications = versions
        .filter((candidate) => version === null || candidate.version <= version)
        .sort((a, b) => a.version - b.version)
        .flatMap(
            (candidate) =>
                candidate.resources?.clarifications.map(
                    (clarification) => clarification.answer,
                ) ?? [],
        );
    return { prompt: shown?.prompt ?? '', clarifications };
};

/** Keep only ids the input's select can offer from this explore. */
const toPick = (
    field: DataAppVizField,
    suggestion: SuggestedChartTypeField,
    itemsMap: ItemsMap,
): AiFieldPick | null => {
    const { dimensions, metrics } = getDataAppVizFieldItems(itemsMap);
    const pools = {
        dimension: dimensions,
        metric: metrics,
        column: [...metrics, ...dimensions],
    };
    const pool = new Set(pools[poolKeyForSlot(field)].map(getItemId));
    const valid = [...new Set(suggestion.fieldIds)].filter((id) =>
        pool.has(id),
    );
    const fieldIds = field.multiple ? valid : valid.slice(0, 1);
    if (fieldIds.length === 0) return null;
    return {
        fieldIds,
        reason: suggestion.reason,
        alternatives: suggestion.alternatives.filter(
            (alternative, index, all) =>
                pool.has(alternative.fieldId) &&
                !fieldIds.includes(alternative.fieldId) &&
                all.findIndex((a) => a.fieldId === alternative.fieldId) ===
                    index,
        ),
    };
};

/**
 * Ask the model which explore fields fit the chart inputs: every input when a
 * table is picked, only the new ones after a rebuild. Failure, timeout, or
 * ambient AI off leave the automap to it. Bindings the author changes win
 * over these through the host's overrides.
 */
export const useAmbientFieldSuggestions = ({
    projectUuid,
    enabled,
    sourceKey,
    explore,
    fields,
    context,
}: {
    projectUuid: string | undefined;
    enabled: boolean;
    /** Changes whenever a table is attached; a new key starts over. */
    sourceKey: string | null;
    explore: LoadedExplore | null;
    fields: DataAppVizField[] | null;
    context: ChartTypePromptContext;
}): AmbientFieldSuggestions => {
    const [state, setState] = useState<SourceSuggestions | null>(null);
    const current = state?.sourceKey === sourceKey ? state : null;

    const pendingFields = useMemo(() => {
        if (!enabled || !projectUuid || !sourceKey || !explore || !fields) {
            return [];
        }
        const asked = new Set(current?.askedFieldNames ?? []);
        return fields.filter((field) => !asked.has(field.name));
    }, [enabled, projectUuid, sourceKey, explore, fields, current]);
    const pendingKey = pendingFields.map((field) => field.name).join('\n');

    const latest = useRef({ pendingFields, explore, context });
    latest.current = { pendingFields, explore, context };

    useEffect(() => {
        const request = latest.current;
        if (pendingKey === '' || !projectUuid || !sourceKey || !request.explore)
            return;
        const requested = request.pendingFields;
        const { itemsMap } = request.explore;
        const controller = new AbortController();
        let isCurrent = true;
        void suggestChartTypeFields(
            projectUuid,
            {
                prompt: request.context.prompt,
                clarifications: request.context.clarifications,
                exploreName: request.explore.name,
                fields: requested,
            },
            controller.signal,
        )
            .then((results) => results.suggestions)
            .catch(() => [] as SuggestedChartTypeField[])
            .then((suggestions) => {
                if (!isCurrent) return;
                const picks = Object.fromEntries(
                    requested.flatMap((field) => {
                        const suggestion = suggestions.find(
                            (candidate) => candidate.fieldName === field.name,
                        );
                        const pick = suggestion
                            ? toPick(field, suggestion, itemsMap)
                            : null;
                        return pick ? [[field.name, pick] as const] : [];
                    }),
                );
                setState((previous) => {
                    const base =
                        previous?.sourceKey === sourceKey ? previous : null;
                    return {
                        sourceKey,
                        askedFieldNames: [
                            ...(base?.askedFieldNames ?? []),
                            ...requested.map((field) => field.name),
                        ],
                        picks: { ...base?.picks, ...picks },
                    };
                });
            });
        return () => {
            isCurrent = false;
            controller.abort();
        };
    }, [pendingKey, projectUuid, sourceKey]);

    const picks = useMemo(() => current?.picks ?? {}, [current]);
    const seed = useMemo<DataAppVizFieldMapping>(
        () =>
            Object.fromEntries(
                (fields ?? []).flatMap((field) => {
                    const pick = picks[field.name];
                    if (!pick) return [];
                    return [
                        [
                            field.name,
                            field.multiple ? pick.fieldIds : pick.fieldIds[0],
                        ] as const,
                    ];
                }),
            ),
        [fields, picks],
    );
    const pendingFieldNames = useMemo(
        () =>
            pendingKey === ''
                ? NO_PENDING
                : new Set(pendingFields.map((field) => field.name)),
        [pendingKey, pendingFields],
    );

    return { pendingFieldNames, seed, picks };
};
