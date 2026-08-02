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
import { useState, type FC, type MouseEvent } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { getResourceUrl } from '../../../../components/common/ResourceView/resourceUtils';
import TruncatedText from '../../../../components/common/TruncatedText';
import { useFavoriteMutation } from '../../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';
import layout from '../homepageLayout.module.css';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

// Kept to one row by default — the rest are a click away behind "+N more",
// so favorites never eat the fold above the hero
const FAVORITES_DEFAULT_VISIBLE = 5;

const FAVORITE_ICONS: Partial<Record<ResourceViewItemType, Icon>> = {
    [ResourceViewItemType.CHART]: IconChartBar,
    [ResourceViewItemType.DASHBOARD]: IconLayoutDashboard,
    [ResourceViewItemType.SPACE]: IconFolder,
    [ResourceViewItemType.DATA_APP]: IconTerminal2,
};

const FavoritePills: FC<{
    projectUuid: string;
    isInteractive: boolean;
    /** Text shown when the user has no favorites. Pass `null` to render nothing
     * (used by the top-bar variant, which hides itself when empty). */
    emptyText: string | null;
    maxVisible?: number;
    wrap?: 'wrap' | 'nowrap';
    justify?: 'flex-start' | 'center';
}> = ({
    projectUuid,
    isInteractive,
    emptyText,
    maxVisible = FAVORITES_DEFAULT_VISIBLE,
    wrap = 'wrap',
    justify = 'flex-start',
}) => {
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);
    const [expanded, setExpanded] = useState(false);

    if (!favorites || favorites.length === 0) {
        return emptyText === null ? null : (
            <div className={classes.dashedEmpty}>{emptyText}</div>
        );
    }

    const handleUnfavorite = (e: MouseEvent, item: ResourceViewItem) => {
        e.preventDefault();
        toggleFavorite({
            contentType: item.type,
            contentUuid: item.data.uuid,
        });
    };

    const canTruncate = favorites.length > maxVisible;
    const visible =
        canTruncate && !expanded ? favorites.slice(0, maxVisible) : favorites;
    const hiddenCount = favorites.length - maxVisible;

    return (
        <Group gap={8} wrap={expanded ? 'wrap' : wrap} justify={justify}>
            {visible.map((item) => (
                <Link
                    key={item.data.uuid}
                    to={getResourceUrl(projectUuid, item)}
                    className={classes.favPill}
                >
                    <MantineIcon
                        icon={FAVORITE_ICONS[item.type] ?? IconChartBar}
                        size={15}
                        color="ldGray.6"
                    />
                    <TruncatedText
                        maxWidth={160}
                        inline
                        fz={13}
                        fw={500}
                        c="inherit"
                    >
                        {item.data.name}
                    </TruncatedText>
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
            {canTruncate ? (
                <button
                    type="button"
                    className={classes.favPillMore}
                    onClick={() => setExpanded((prev) => !prev)}
                >
                    {expanded ? 'Show less' : `+${hiddenCount} more`}
                </button>
            ) : null}
        </Group>
    );
};

/** The one favorites presentation — shared by the strip above the hero and the
 * favorites block, so the two never drift apart. */
const FavoritesSection: FC<{
    projectUuid: string;
    title: string;
    isInteractive: boolean;
    emptyText: string | null;
}> = ({ projectUuid, title, isInteractive, emptyText }) => (
    <Stack gap={0}>
        <BlockHeader
            icon={IconStar}
            title={title}
            pill="Only you see this"
            centered
        />
        <FavoritePills
            projectUuid={projectUuid}
            isInteractive={isInteractive}
            justify="center"
            emptyText={emptyText}
        />
    </Stack>
);

/** Favorites pinned above the hero. Hides itself entirely when the user has no
 * favorites — day-0 shouldn't open with an empty shelf. */
export const PersonalFavoritesBar: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: favorites } = useFavorites(projectUuid);

    if (!favorites || favorites.length === 0) {
        return null;
    }

    return (
        <div className={layout.favBar}>
            <FavoritesSection
                projectUuid={projectUuid}
                title="My favorites"
                isInteractive
                emptyText={null}
            />
        </div>
    );
};

export const FavoritesBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'favorites') return null;
    return (
        <FavoritesSection
            projectUuid={projectUuid}
            title={block.config.title}
            isInteractive
            emptyText="Star any dashboard or chart to keep it here — each person sees their own favorites."
        />
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
                centered
            />
            <FavoritePills
                projectUuid={projectUuid}
                isInteractive={false}
                justify="center"
                emptyText="Empty until this viewer stars something — each person sees their own favorites here."
            />
            <div className={classes.buildHint}>
                Showing your favorites as a sample — every viewer sees their
                own.
            </div>
        </Stack>
    );
};
