import {
    type ApiAppVersionSummary,
    getItemId,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type SuggestedChartTypeField,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
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
    /** Item ids of the runners-up. */
    alternatives: string[];
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

// An answer outlives the attach that asked for it, so a table suggested in the
// picker can be asked about before the author picks it.
const ANSWER_CACHE_MS = 5 * 60 * 1000;

const answerQuery = (
    projectUuid: string,
    exploreName: string,
    fields: DataAppVizField[],
    context: ChartTypePromptContext,
) => ({
    queryKey: [
        'chart-type-field-suggestions-answer',
        projectUuid,
        exploreName,
        fields.map((field) => field.name),
        context.prompt,
        context.clarifications,
    ],
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
        suggestChartTypeFields(
            projectUuid,
            {
                prompt: context.prompt,
                clarifications: context.clarifications,
                exploreName,
                fields,
            },
            signal,
        ).then((results) => results.suggestions),
    retry: false,
    staleTime: Infinity,
    cacheTime: ANSWER_CACHE_MS,
});

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
        alternatives: [...new Set(suggestion.alternatives)].filter(
            (id) => pool.has(id) && !fieldIds.includes(id),
        ),
    };
};

/**
 * Ask the model which explore fields fit the chart inputs: every input when a
 * table is picked, only the new ones after a rebuild. Failure, timeout, or
 * ambient AI off leave the automap to it. Bindings the author changes win
 * over these through the host's overrides. The table ambient AI suggests is
 * asked about as soon as it is known, so picking it finds the answer ready.
 */
export const useAmbientFieldSuggestions = ({
    projectUuid,
    enabled,
    sourceKey,
    explore,
    fields,
    context,
    suggestedExploreName,
}: {
    projectUuid: string | undefined;
    enabled: boolean;
    /** Changes whenever a table is attached; a new key starts over. */
    sourceKey: string | null;
    explore: LoadedExplore | null;
    fields: DataAppVizField[] | null;
    context: ChartTypePromptContext;
    /** The table the picker will suggest; null when none is known yet. */
    suggestedExploreName: string | null;
}): AmbientFieldSuggestions => {
    const queryClient = useQueryClient();
    const history = useRef<SourceSuggestions | null>(null);
    useEffect(() => {
        if (!enabled || !projectUuid || !suggestedExploreName || !fields) {
            return;
        }
        if (fields.length === 0 || suggestedExploreName === explore?.name) {
            return;
        }
        void queryClient.prefetchQuery(
            answerQuery(projectUuid, suggestedExploreName, fields, context),
        );
    }, [
        queryClient,
        enabled,
        projectUuid,
        suggestedExploreName,
        explore?.name,
        fields,
        context,
    ]);
    const request =
        enabled && projectUuid && sourceKey && explore && fields
            ? { projectUuid, sourceKey, explore, fields, context }
            : null;
    const { data } = useQuery({
        queryKey: [
            'chart-type-field-suggestions',
            projectUuid,
            sourceKey,
            fields?.map((field) => field.name),
        ],
        queryFn: async ({ signal }): Promise<SourceSuggestions> => {
            if (!request) {
                throw new Error('Chart field suggestions need an explore');
            }
            const base =
                history.current?.sourceKey === request.sourceKey
                    ? history.current
                    : null;
            const asked = new Set(base?.askedFieldNames ?? []);
            const requested = request.fields.filter(
                (field) => !asked.has(field.name),
            );
            const suggestions =
                requested.length === 0
                    ? []
                    : await queryClient
                          .fetchQuery(
                              answerQuery(
                                  request.projectUuid,
                                  request.explore.name,
                                  requested,
                                  request.context,
                              ),
                          )
                          .catch(() => [] as SuggestedChartTypeField[]);
            const picks = Object.fromEntries(
                requested.flatMap((field) => {
                    const suggestion = suggestions.find(
                        (candidate) => candidate.fieldName === field.name,
                    );
                    const pick = suggestion
                        ? toPick(field, suggestion, request.explore.itemsMap)
                        : null;
                    return pick ? [[field.name, pick] as const] : [];
                }),
            );
            const result = {
                sourceKey: request.sourceKey,
                askedFieldNames: [
                    ...(base?.askedFieldNames ?? []),
                    ...requested.map((field) => field.name),
                ],
                picks: { ...base?.picks, ...picks },
            };
            if (!signal?.aborted) history.current = result;
            return result;
        },
        enabled: request !== null && request.fields.length > 0,
        retry: false,
        staleTime: Infinity,
        cacheTime: 0,
    });
    const current =
        data?.sourceKey === sourceKey
            ? data
            : history.current?.sourceKey === sourceKey
              ? history.current
              : null;

    const pendingFields = useMemo(() => {
        if (!enabled || !projectUuid || !sourceKey || !explore || !fields) {
            return [];
        }
        const asked = new Set(current?.askedFieldNames ?? []);
        return fields.filter((field) => !asked.has(field.name));
    }, [enabled, projectUuid, sourceKey, explore, fields, current]);
    const pendingKey = pendingFields.map((field) => field.name).join('\n');

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
