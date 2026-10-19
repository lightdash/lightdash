import { LightdashMode, type ReleaseHighlight } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
    Title,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconArrowUpRight,
    IconExternalLink,
    IconSparkles,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    getChangesSinceVersionUrl,
    RELEASE_NOTES_URL,
    UPDATE_LIGHTDASH_DOCS_URL,
} from '../../../components/upgradeNoticeLinks';
import useApp from '../../../providers/App/useApp';
import { useAmbientAiEnabled } from '../ambientAi/hooks/useAmbientAiEnabled';
import { useReleaseHighlights } from './useReleaseHighlights';

type WhatsNewLayout = 'page' | 'drawer';

const HighlightCard: FC<{
    highlight: ReleaseHighlight;
    layout: WhatsNewLayout;
}> = ({ highlight, layout }) => (
    <Paper p={layout === 'drawer' ? 'sm' : 'md'}>
        <Stack gap="xs">
            <Group gap="xs">
                <Text fw={500}>{highlight.title}</Text>
                {highlight.requestedByYourOrganization && (
                    <Badge color="green" variant="light">
                        Requested
                    </Badge>
                )}
            </Group>
            <Text size="sm" c="dimmed">
                {highlight.benefit}
            </Text>
            <Text size="xs" c="dimmed">
                Added in v{highlight.version}
            </Text>
            <Group justify="flex-end">
                <Anchor
                    href={highlight.url}
                    target="_blank"
                    rel="noreferrer"
                    size="sm"
                >
                    <Group component="span" gap="xs">
                        {highlight.url.includes('/pull/')
                            ? 'View pull request'
                            : 'View release'}
                        <MantineIcon icon={IconExternalLink} />
                        <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                    </Group>
                </Anchor>
            </Group>
        </Stack>
    </Paper>
);

const HighlightsSkeleton: FC = () => (
    <Stack gap="sm" aria-label="Loading release highlights">
        <Skeleton h={160} />
        <Skeleton h={160} />
        <Skeleton h={160} />
    </Stack>
);

const ReleaseHighlightsSections: FC<{
    highlights: ReleaseHighlight[];
    layout: WhatsNewLayout;
}> = ({ highlights, layout }) => {
    const requestedHighlights = highlights.filter(
        (highlight) => highlight.requestedByYourOrganization,
    );
    const otherHighlights = highlights.filter(
        (highlight) => !highlight.requestedByYourOrganization,
    );

    return (
        <>
            {requestedHighlights.length > 0 && (
                <Stack gap="sm">
                    <Title order={5}>Requested by your organization</Title>
                    {requestedHighlights.map((highlight) => (
                        <HighlightCard
                            key={`${highlight.url}-${highlight.title}`}
                            highlight={highlight}
                            layout={layout}
                        />
                    ))}
                </Stack>
            )}
            <Stack gap="sm">
                <Stack gap="xs">
                    <Group gap="xs">
                        <Title order={5}>Highlights</Title>
                        <Badge
                            color="indigo"
                            variant="light"
                            leftSection={
                                <MantineIcon icon={IconSparkles} size="xs" />
                            }
                        >
                            AI summary
                        </Badge>
                    </Group>
                    <Text c="dimmed" size="sm">
                        Summarised by your configured AI model from public
                        release notes. Check the full changelog for fixes and
                        breaking changes.
                    </Text>
                </Stack>
                {otherHighlights.map((highlight) => (
                    <HighlightCard
                        key={`${highlight.url}-${highlight.title}`}
                        highlight={highlight}
                        layout={layout}
                    />
                ))}
            </Stack>
        </>
    );
};

const ReleaseHighlightsContent: FC<{
    enabled: boolean;
    layout: WhatsNewLayout;
    query: ReturnType<typeof useReleaseHighlights>;
}> = ({ enabled, layout, query }) => {
    if (!enabled) {
        return (
            <Text c="dimmed" size="sm">
                Turn on AI to see a summary of new features here.
            </Text>
        );
    }
    if (query.isInitialLoading) return <HighlightsSkeleton />;
    if (
        !query.isError &&
        query.data?.status === 'ready' &&
        query.data.highlights.length > 0
    ) {
        return (
            <ReleaseHighlightsSections
                highlights={query.data.highlights}
                layout={layout}
            />
        );
    }
    const temporarilyUnavailable =
        !query.isError &&
        query.data?.status === 'unavailable' &&
        (query.data.reason === 'generation_failed' ||
            query.data.reason === 'rate_limited');
    return (
        <Text c="dimmed" size="sm">
            {temporarilyUnavailable
                ? "Highlights aren't available right now."
                : 'No feature highlights for this range.'}
        </Text>
    );
};

export const WhatsNewContent: FC<{ layout: WhatsNewLayout }> = ({ layout }) => {
    const { health } = useApp();
    const currentVersion = health.data?.version;
    const latestVersion = health.data?.latest.version;
    const hasUpdate =
        !!currentVersion &&
        !!latestVersion &&
        currentVersion !== latestVersion &&
        health.data?.mode === LightdashMode.DEFAULT;
    const ambientAiEnabled = !!useAmbientAiEnabled();
    const query = useReleaseHighlights({
        enabled: hasUpdate && ambientAiEnabled,
    });

    if (health.isInitialLoading) return <HighlightsSkeleton />;
    if (!hasUpdate) {
        return (
            <>
                <Title order={layout === 'drawer' ? 4 : 2}>
                    You're on the latest version
                </Title>
                <Group>
                    <Button
                        component="a"
                        href={RELEASE_NOTES_URL}
                        target="_blank"
                        rel="noreferrer"
                        rightSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        Release notes
                        <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                    </Button>
                </Group>
            </>
        );
    }
    return (
        <>
            <Stack gap="xs">
                <Text c="dimmed" size="sm">
                    You're on v{currentVersion} · latest is v{latestVersion}
                </Text>
                <Title order={layout === 'drawer' ? 4 : 2}>
                    What's new since v{currentVersion}
                </Title>
            </Stack>
            <Group gap="xs" wrap="wrap">
                <Button
                    component="a"
                    href={UPDATE_LIGHTDASH_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    rightSection={<MantineIcon icon={IconExternalLink} />}
                >
                    How to update
                    <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                </Button>
                <Button
                    component="a"
                    href={getChangesSinceVersionUrl(
                        currentVersion,
                        latestVersion,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    variant="default"
                    rightSection={<MantineIcon icon={IconExternalLink} />}
                >
                    Changes since v{currentVersion}
                    <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                </Button>
                <Button
                    component="a"
                    href={RELEASE_NOTES_URL}
                    target="_blank"
                    rel="noreferrer"
                    variant="default"
                    rightSection={<MantineIcon icon={IconExternalLink} />}
                >
                    Release notes
                    <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                </Button>
                {layout === 'drawer' && (
                    <Button
                        component="a"
                        href="/whats-new"
                        target="_blank"
                        rel="noreferrer"
                        variant="subtle"
                        rightSection={<MantineIcon icon={IconArrowUpRight} />}
                    >
                        Open full page
                        <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                    </Button>
                )}
            </Group>

            <ReleaseHighlightsContent
                enabled={ambientAiEnabled}
                layout={layout}
                query={query}
            />
        </>
    );
};
