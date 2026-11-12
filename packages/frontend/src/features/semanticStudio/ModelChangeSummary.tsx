import { type ApiError, type Explore } from '@lightdash/common';
import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, type FC } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
} from './developmentView';
import { diffModelFields, type FieldChange } from './modelFieldDiff';

const KINDS: Record<FieldChange['kind'], { label: string; color: string }> = {
    new: { label: 'New', color: 'green' },
    changed: { label: 'Changed', color: 'orange' },
    removed: { label: 'Removed', color: 'red' },
};

/** One version of a model, asked for by name so it does not follow the page's own view. */
const useModelVersion = (
    projectUuid: string,
    model: string,
    headers: Record<string, string>,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Explore, ApiError>({
        queryKey: [
            'semantic-studio-model-version',
            projectUuid,
            model,
            headers,
        ],
        queryFn: () =>
            lightdashApi<Explore>({
                version: 'v1',
                url: `/projects/${projectUuid}/explores/${encodeURIComponent(model)}`,
                method: 'GET',
                body: undefined,
                headers,
            }),
        retry: false,
    });
};

/** What the person's changes do to this model's fields, shown above them so it does not have to be found in a diff. */
export const ModelChangeSummary: FC<{
    projectUuid: string;
    model: string;
    /** The preview project that holds the changes, for a pull request that has one. */
    previewProjectUuid: string | null;
}> = ({ projectUuid, model, previewProjectUuid }) => {
    const live = useModelVersion(projectUuid, model, {
        [DEVELOPMENT_VIEW_HEADER]: 'false',
    });
    const mine = useModelVersion(projectUuid, model, {
        [DEVELOPMENT_VIEW_HEADER]: 'true',
        ...(previewProjectUuid
            ? { [DEVELOPMENT_PREVIEW_HEADER]: previewProjectUuid }
            : {}),
    });
    const changes = useMemo(
        () =>
            // A model that is new has no live version to read.
            mine.data && (live.data || live.isError)
                ? diffModelFields(live.data ?? null, mine.data)
                : null,
        [live.data, live.isError, mine.data],
    );
    if (!changes) return null;
    return (
        <Paper withBorder p="sm" radius="md" mb="sm">
            <Stack gap={6}>
                <Text fz="xs" fw={500}>
                    {live.data
                        ? 'What your changes do to this model'
                        : 'This model is new in your changes'}
                </Text>
                {changes.length === 0 ? (
                    <Text fz="xs" c="dimmed">
                        No field is added, changed or removed. The change may be
                        in how the model is built.
                    </Text>
                ) : (
                    changes.map(({ key, label, kind, attributes }) => (
                        <Group key={key} gap="xs" wrap="nowrap">
                            <Badge
                                size="sm"
                                color={KINDS[kind].color}
                                flex="none"
                            >
                                {KINDS[kind].label}
                            </Badge>
                            <Text fz="xs" fw={500} truncate>
                                {label}
                            </Text>
                            {attributes.length > 0 ? (
                                <Text fz="xs" c="dimmed" truncate>
                                    {attributes.join(', ')}
                                </Text>
                            ) : null}
                        </Group>
                    ))
                )}
            </Stack>
        </Paper>
    );
};
