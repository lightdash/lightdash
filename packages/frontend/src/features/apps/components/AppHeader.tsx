import {
    ContentType,
    getAppDisplayName,
    type AppVersionStatus,
} from '@lightdash/common';
import { ActionIcon, Group, Popover, Title } from '@mantine-8/core';
import { IconInfoCircle, IconStar, IconStarFilled } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { DASHBOARD_HEADER_HEIGHT } from '../../../components/common/Dashboard/dashboard.constants';
import MantineIcon from '../../../components/common/MantineIcon';
import PageHeader from '../../../components/common/Page/PageHeader';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import classes from './AppHeader.module.css';
import AppInfoOverlay from './AppInfoOverlay';
import { FavoritePersonalDataAppModal } from './FavoritePersonalDataAppModal';

type AppHeaderApp = {
    uuid: string;
    name: string;
    description: string | null;
    spaceUuid: string | null;
    spaceName: string | null;
    createdByUserUuid: string | null;
    latestVersionNumber: number | null;
    latestVersionStatus: AppVersionStatus | null;
    /** Timestamp of the latest build activity; null when never built. */
    lastModified: Date | null;
    views: number | null;
    slug: string | null;
};

type Props = {
    projectUuid: string;
    app: AppHeaderApp;
    /** Per-page actions (edit button, refresh, overflow menu, …) rendered on
     *  the right. The builder and viewer have different actions, so each owns
     *  its own slot while sharing this header chrome. */
    rightSection: ReactNode;
};

/**
 * Shared header bar for a data app, used by both the builder (`AppGenerate`)
 * and the standalone viewer (`AppPreviewTest`). Follows the dashboard header's
 * design: one-line title, info popover holding description/space metadata, and
 * an inline favorite star.
 */
const AppHeader: FC<Props> = ({ projectUuid, app, rightSection }) => {
    const displayName = getAppDisplayName(app.name, app.uuid);

    const { data: favorites } = useFavorites(projectUuid);
    const favoriteMutation = useFavoriteMutation(projectUuid);
    const isFavorited =
        favorites?.some((favorite) => favorite.data.uuid === app.uuid) ?? false;
    const [favoriteSpaceModalOpen, setFavoriteSpaceModalOpen] = useState(false);

    return (
        <PageHeader
            cardProps={{
                px: 'xl',
                py: 0,
                h: DASHBOARD_HEADER_HEIGHT,
                className: classes.header,
            }}
        >
            <Group gap="xs" flex={1} wrap="nowrap" miw={0}>
                <Title order={6} lineClamp={1} miw={0}>
                    {displayName}
                </Title>

                <Popover
                    withinPortal
                    withArrow
                    offset={{
                        mainAxis: -2,
                        crossAxis: 6,
                    }}
                >
                    <Popover.Target>
                        <ActionIcon
                            variant="subtle"
                            size="md"
                            radius="md"
                            color="ldGray.6"
                        >
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Popover.Target>

                    <Popover.Dropdown maw={500} p={0}>
                        <AppInfoOverlay
                            projectUuid={projectUuid}
                            displayName={displayName}
                            description={app.description}
                            spaceUuid={app.spaceUuid}
                            spaceName={app.spaceName}
                            lastModified={app.lastModified}
                            views={app.views}
                            slug={app.slug}
                        />
                    </Popover.Dropdown>
                </Popover>

                <ActionIcon
                    variant="subtle"
                    size="md"
                    radius="md"
                    color={isFavorited ? 'orange' : 'ldGray.6'}
                    disabled={favoriteMutation.isLoading}
                    aria-label={
                        isFavorited
                            ? 'Remove from favorites'
                            : 'Add to favorites'
                    }
                    onClick={() => {
                        // Personal apps must be filed in a space before they
                        // can be favorited.
                        if (!isFavorited && !app.spaceUuid) {
                            setFavoriteSpaceModalOpen(true);
                            return;
                        }
                        favoriteMutation.mutate({
                            contentType: ContentType.DATA_APP,
                            contentUuid: app.uuid,
                        });
                    }}
                >
                    <MantineIcon
                        icon={isFavorited ? IconStarFilled : IconStar}
                        size={16}
                    />
                </ActionIcon>
            </Group>

            <Group gap="sm" wrap="nowrap">
                {rightSection}
            </Group>

            {favoriteSpaceModalOpen && (
                <FavoritePersonalDataAppModal
                    projectUuid={projectUuid}
                    opened
                    onClose={() => setFavoriteSpaceModalOpen(false)}
                    app={{
                        uuid: app.uuid,
                        name: app.name,
                        description: app.description ?? undefined,
                        spaceUuid: app.spaceUuid,
                        createdByUserUuid: app.createdByUserUuid,
                        latestVersionNumber: app.latestVersionNumber,
                        latestVersionStatus: app.latestVersionStatus,
                    }}
                />
            )}
        </PageHeader>
    );
};

export default AppHeader;
