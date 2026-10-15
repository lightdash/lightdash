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
import { useTranslation } from 'react-i18next';
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
}> = ({ highlight, layout }) => {
    const { t } = useTranslation('eeMisc');
    return (
        <Paper p={layout === 'drawer' ? 'sm' : 'md'}>
            <Stack gap="xs">
                <Group gap="xs">
                    <Text fw={500}>{highlight.title}</Text>
                    {highlight.requestedByYourOrganization && (
                        <Badge color="green" variant="light">
                            {t('whatsNew.requested')}
                        </Badge>
                    )}
                </Group>
                <Text size="sm" c="dimmed">
                    {highlight.benefit}
                </Text>
                <Text size="xs" c="dimmed">
                    {t('whatsNew.addedIn', { version: highlight.version })}
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
                                ? t('whatsNew.viewPullRequest')
                                : t('whatsNew.viewRelease')}
                            <MantineIcon icon={IconExternalLink} />
                            <VisuallyHidden>
                                {' '}
                                {t('whatsNew.opensInNewTab')}
                            </VisuallyHidden>
                        </Group>
                    </Anchor>
                </Group>
            </Stack>
        </Paper>
    );
};

const HighlightsSkeleton: FC = () => {
    const { t } = useTranslation('eeMisc');
    return (
        <Stack gap="sm" aria-label={t('whatsNew.loading')}>
            <Skeleton h={160} />
            <Skeleton h={160} />
            <Skeleton h={160} />
        </Stack>
    );
};

const ReleaseHighlightsSections: FC<{
    highlights: ReleaseHighlight[];
    layout: WhatsNewLayout;
}> = ({ highlights, layout }) => {
    const { t } = useTranslation('eeMisc');
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
                    <Title order={5}>
                        {t('whatsNew.requestedByOrganization')}
                    </Title>
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
                        <Title order={5}>{t('whatsNew.highlights')}</Title>
                        <Badge
                            color="indigo"
                            variant="light"
                            leftSection={
                                <MantineIcon icon={IconSparkles} size="xs" />
                            }
                        >
                            {t('whatsNew.aiSummary')}
                        </Badge>
                    </Group>
                    <Text c="dimmed" size="sm">
                        {t('whatsNew.summaryNote')}
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
    const { t } = useTranslation('eeMisc');
    if (!enabled) {
        return (
            <Text c="dimmed" size="sm">
                {t('whatsNew.turnOnAi')}
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
                ? t('whatsNew.unavailable')
                : t('whatsNew.noHighlights')}
        </Text>
    );
};

export const WhatsNewContent: FC<{ layout: WhatsNewLayout }> = ({ layout }) => {
    const { t } = useTranslation('eeMisc');
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
                    {t('whatsNew.latestVersion')}
                </Title>
                <Group>
                    <Button
                        component="a"
                        href={RELEASE_NOTES_URL}
                        target="_blank"
                        rel="noreferrer"
                        rightSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        {t('whatsNew.releaseNotes')}
                        <VisuallyHidden>
                            {' '}
                            {t('whatsNew.opensInNewTab')}
                        </VisuallyHidden>
                    </Button>
                </Group>
            </>
        );
    }
    return (
        <>
            <Stack gap="xs">
                <Text c="dimmed" size="sm">
                    {t('whatsNew.versionStatus', {
                        current: currentVersion,
                        latest: latestVersion,
                    })}
                </Text>
                <Title order={layout === 'drawer' ? 4 : 2}>
                    {t('whatsNew.whatsNewSince', { version: currentVersion })}
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
                    {t('whatsNew.howToUpdate')}
                    <VisuallyHidden>
                        {' '}
                        {t('whatsNew.opensInNewTab')}
                    </VisuallyHidden>
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
                    {t('whatsNew.changesSince', { version: currentVersion })}
                    <VisuallyHidden>
                        {' '}
                        {t('whatsNew.opensInNewTab')}
                    </VisuallyHidden>
                </Button>
                <Button
                    component="a"
                    href={RELEASE_NOTES_URL}
                    target="_blank"
                    rel="noreferrer"
                    variant="default"
                    rightSection={<MantineIcon icon={IconExternalLink} />}
                >
                    {t('whatsNew.releaseNotes')}
                    <VisuallyHidden>
                        {' '}
                        {t('whatsNew.opensInNewTab')}
                    </VisuallyHidden>
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
                        {t('whatsNew.openFullPage')}
                        <VisuallyHidden>
                            {' '}
                            {t('whatsNew.opensInNewTab')}
                        </VisuallyHidden>
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
