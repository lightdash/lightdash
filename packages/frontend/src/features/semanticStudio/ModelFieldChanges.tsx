import { type Explore } from '@lightdash/common';
import { Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, type FC } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { developmentHeadersFor, PUBLISHED_HEADERS } from './developmentView';
import { FieldUsage } from './DraftInsights';
import { CHANGE_KIND_STYLE } from './modelCode';
import {
    describeUnchangedFields,
    diffModelFields,
    findTouchedFields,
    type FieldChange,
} from './modelFieldDiff';
import { MODEL_VERSION_KEY } from './studioQueryKeys';
import { modelVersionQuery } from './useFieldChangesInDevelopment';
import { useModelFieldChanges } from './useModelFieldChanges';
import { useSemanticLayerFieldUsage } from './useSemanticLayerModel';

const FieldChangeRows: FC<{ live: Explore | null; changes: FieldChange[] }> = ({
    live,
    changes,
}) => {
    return (
        <Stack gap={6}>
            {live ? null : (
                <Text fz="xs" c="dimmed">
                    This model is new.
                </Text>
            )}
            {changes.map(({ key, label, kind, attributes }) => (
                // The sign sits in the column of the model's icon, so names line up with the model's.
                <Group key={key} gap={6} wrap="nowrap">
                    <Text
                        fz="xs"
                        ff="monospace"
                        fw={600}
                        w={16}
                        ta="center"
                        flex="none"
                        c={`${CHANGE_KIND_STYLE[kind].color}.7`}
                    >
                        <span aria-hidden>{CHANGE_KIND_STYLE[kind].glyph}</span>
                        <VisuallyHidden>
                            {CHANGE_KIND_STYLE[kind].label}
                        </VisuallyHidden>
                    </Text>
                    <Text fz="xs" fw={500} truncate>
                        {label}
                    </Text>
                    {attributes.length > 0 ? (
                        <Text fz="xs" c="dimmed" truncate>
                            {attributes.join(', ')}
                        </Text>
                    ) : null}
                </Group>
            ))}
        </Stack>
    );
};

/** What the person's changes do to this model's fields, in plain words. */
export const ModelFieldChanges: FC<{
    projectUuid: string;
    model: string;
    /** The preview project that holds the changes, for a pull request that has one. */
    previewProjectUuid: string | null;
}> = ({ projectUuid, model, previewProjectUuid }) => {
    const { live, changes } = useModelFieldChanges(
        projectUuid,
        model,
        previewProjectUuid,
    );
    if (!changes) return null;
    if (changes.length === 0) {
        return (
            <Text fz="xs" c="dimmed">
                No field is added, changed or removed.
            </Text>
        );
    }
    return <FieldChangeRows live={live} changes={changes} />;
};

/** What a draft does to the fields of all its models: each changed field, or one line when none is. */
export const DraftFieldChanges: FC<{
    projectUuid: string;
    models: string[];
    previewProjectUuid: string | null;
    /** Until the draft compiles its fields are the old ones, so an empty diff says nothing yet. */
    isCompiled: boolean;
    fileCount: number;
}> = ({ projectUuid, models, previewProjectUuid, isCompiled, fileCount }) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    // The fields read while the draft compiled are the old ones.
    useEffect(() => {
        if (!isCompiled) return;
        void queryClient.invalidateQueries({
            queryKey: [MODEL_VERSION_KEY, projectUuid],
        });
    }, [isCompiled, projectUuid, queryClient]);
    const sides = useQueries({
        queries: models.flatMap((model) => [
            modelVersionQuery(
                lightdashApi,
                projectUuid,
                model,
                PUBLISHED_HEADERS,
            ),
            modelVersionQuery(
                lightdashApi,
                projectUuid,
                model,
                developmentHeadersFor(previewProjectUuid),
            ),
        ]),
    });
    const read = models.map((model, index) => {
        const live = sides[index * 2].data;
        const mine = sides[index * 2 + 1].data;
        return {
            model,
            live: live ?? null,
            // A model that is new has no live version to read.
            changes:
                mine && live !== undefined ? diffModelFields(live, mine) : null,
        };
    });
    const unchanged = describeUnchangedFields(
        read.map(({ changes }) => changes),
        isCompiled && sides.every(({ isFetching }) => !isFetching),
        fileCount,
    );
    return (
        <>
            {read.map(({ model, live, changes }) =>
                changes && changes.length > 0 ? (
                    <FieldChangeRows
                        key={model}
                        live={live}
                        changes={changes}
                    />
                ) : null,
            )}
            {unchanged ? (
                <Text fz="xs" c="dimmed">
                    {unchanged}
                </Text>
            ) : null}
        </>
    );
};

/** Saved content that reads a field the pull request redefines or removes, looked up before it goes live. */
export const PullRequestUsage: FC<{
    projectUuid: string;
    models: string[];
    previewProjectUuid: string | null;
}> = ({ projectUuid, models, previewProjectUuid }) => {
    const lightdashApi = useLightdashApi();
    const sides = useQueries({
        queries: models.flatMap((model) => [
            modelVersionQuery(
                lightdashApi,
                projectUuid,
                model,
                PUBLISHED_HEADERS,
            ),
            modelVersionQuery(
                lightdashApi,
                projectUuid,
                model,
                developmentHeadersFor(previewProjectUuid),
            ),
        ]),
    });
    // Without both versions of every model nothing can be said about what moved.
    const touched = sides.every(({ isLoading }) => !isLoading)
        ? models.flatMap((_, index) => {
              const live = sides[index * 2].data;
              const mine = sides[index * 2 + 1].data;
              return live && mine ? findTouchedFields(live, mine) : [];
          })
        : [];
    const { data } = useSemanticLayerFieldUsage(projectUuid, touched);
    return <FieldUsage projectUuid={projectUuid} usage={data} />;
};
