import { Anchor, Badge, Group, Loader, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useAmbientAiEnabled } from '../ambientAi/hooks/useAmbientAiEnabled';
import { useReleaseHighlights } from './useReleaseHighlights';

export const ReleaseHighlightsPanel: FC = () => {
    const enabled = !!useAmbientAiEnabled();
    const query = useReleaseHighlights({ enabled });
    if (!enabled || query.isError) return null;
    if (query.isInitialLoading) {
        return (
            <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                    Finding release highlights…
                </Text>
            </Group>
        );
    }
    if (query.data?.status !== 'ready' || query.data.highlights.length === 0)
        return null;
    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">
                Highlights since v{query.data.fromVersion}
            </Text>
            {query.data.highlights.slice(0, 5).map((highlight) => (
                <Stack key={`${highlight.url}-${highlight.title}`} gap={4}>
                    <Group gap="xs">
                        <Anchor
                            href={highlight.url}
                            target="_blank"
                            rel="noreferrer"
                            fw={500}
                            size="sm"
                        >
                            {highlight.title}
                        </Anchor>
                        {highlight.requestedByYourOrganization && (
                            <Badge size="xs">You asked for this</Badge>
                        )}
                    </Group>
                    <Text size="sm" c="dimmed">
                        {highlight.benefit}
                    </Text>
                </Stack>
            ))}
            <Text size="xs" c="dimmed">
                AI-generated from release notes
            </Text>
        </Stack>
    );
};
