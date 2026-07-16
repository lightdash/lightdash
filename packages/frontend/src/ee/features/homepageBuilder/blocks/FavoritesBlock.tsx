import { ResourceViewItemType, type ResourceViewItem } from '@lightdash/common';
import { Group, Stack } from '@mantine-8/core';
import {
    IconChartBar,
    IconFolder,
    IconLayoutDashboard,
    IconStar,
    IconStarFilled,
    IconTerminal2,
    type Icon,
} from '@tabler/icons-react';
import { type FC, type MouseEvent } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useFavoriteMutation } from '../../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const FAVORITE_ICONS: Partial<Record<ResourceViewItemType, Icon>> = {
    [ResourceViewItemType.CHART]: IconChartBar,
    [ResourceViewItemType.DASHBOARD]: IconLayoutDashboard,
    [ResourceViewItemType.SPACE]: IconFolder,
    [ResourceViewItemType.DATA_APP]: IconTerminal2,
};

const favoriteUrl = (projectUuid: string, item: ResourceViewItem): string => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${item.data.uuid}/view`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUuid}/spaces/${item.data.uuid}`;
        case ResourceViewItemType.DATA_APP:
            return `/projects/${projectUuid}/apps/${item.data.uuid}`;
        default:
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
    }
};

const FavoritePills: FC<{
    projectUuid: string;
    isInteractive: boolean;
    emptyText: string;
}> = ({ projectUuid, isInteractive, emptyText }) => {
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);

    if (!favorites || favorites.length === 0) {
        return <div className={classes.dashedEmpty}>{emptyText}</div>;
    }

    const handleUnfavorite = (e: MouseEvent, item: ResourceViewItem) => {
        e.preventDefault();
        toggleFavorite({
            contentType: item.type,
            contentUuid: item.data.uuid,
        });
    };

    return (
        <Group gap={8}>
            {favorites.map((item) => (
                <Link
                    key={item.data.uuid}
                    to={favoriteUrl(projectUuid, item)}
                    className={classes.favPill}
                >
                    <MantineIcon
                        icon={FAVORITE_ICONS[item.type] ?? IconChartBar}
                        size={15}
                        color="ldGray.6"
                    />
                    {item.data.name}
                    {isInteractive ? (
                        <MantineIcon
                            icon={IconStarFilled}
                            size={13}
                            color="ldGray.7"
                            className={classes.clickable}
                            aria-label={`Remove ${item.data.name} from favorites`}
                            onClick={(e) => handleUnfavorite(e, item)}
                        />
                    ) : (
                        <MantineIcon
                            icon={IconStarFilled}
                            size={13}
                            color="ldGray.7"
                        />
                    )}
                </Link>
            ))}
        </Group>
    );
};

export const PersonalFavoritesStrip: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => (
    <Stack gap={0}>
        <BlockHeader
            icon={IconStar}
            title="My favorites"
            pill="Only you see this"
            mb={10}
        />
        <FavoritePills
            projectUuid={projectUuid}
            isInteractive
            emptyText="Star any dashboard or chart below to keep it here, on every homepage."
        />
    </Stack>
);

export const FavoritesBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'favorites') return null;
    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconStar}
                title={block.config.title}
                pill="Only you see this"
            />
            <FavoritePills
                projectUuid={projectUuid}
                isInteractive
                emptyText="Star any dashboard or chart to keep it here — each person sees their own favorites."
            />
        </Stack>
    );
};

export const FavoritesBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'favorites') return null;
    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconStar}
                title={block.config.title}
                pill="Personal per viewer"
            />
            <FavoritePills
                projectUuid={projectUuid}
                isInteractive={false}
                emptyText="Empty until this viewer stars something — each person sees their own favorites here."
            />
            <div className={classes.buildHint}>
                Showing your favorites as a sample — every viewer sees their
                own.
            </div>
        </Stack>
    );
};
