import { Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { type FC } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { developmentHeadersFor, PUBLISHED_HEADERS } from './developmentView';
import { FieldUsage } from './DraftInsights';
import { CHANGE_KIND_STYLE } from './modelCode';
import { findTouchedFields } from './modelFieldDiff';
import { modelVersionQuery } from './useFieldChangesInDevelopment';
import { useModelFieldChanges } from './useModelFieldChanges';
import { useSemanticLayerFieldUsage } from './useSemanticLayerModel';

/** What the person's changes do to this model's fields, in plain words. */
export const ModelFieldChanges: FC<{
    projectUuid: string;
    model: string;
    /** The preview project that holds the changes, for a pull request that has one. */
    previewProjectUuid: string | null;
    /** Until the draft compiles its fields are the old ones, so an empty diff says nothing yet. */
    isCompiled: boolean;
}> = ({ projectUuid, model, previewProjectUuid, isCompiled }) => {
    const { live, changes } = useModelFieldChanges(
        projectUuid,
        model,
        previewProjectUuid,
    );
    if (!changes) return null;
    if (changes.length === 0) {
        return (
            <Text fz="xs" c="dimmed">
                {isCompiled
                    ? 'No field is added, changed or removed.'
                    : 'Fields show here once the draft compiles.'}
            </Text>
        );
    }
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
