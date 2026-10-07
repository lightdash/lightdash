import {
    ContentType,
    contentToResourceViewItem,
    ResourceViewItemType,
    type SummaryContent,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine/core';
import { IconCircleCheckFilled, IconEye, IconX } from '@tabler/icons-react';
import { type FC, type PropsWithChildren } from 'react';
import { Link } from 'react-router';
import { FavoriteActionIcon } from '../../../../components/common/FavoriteActionIcon';
import MantineIcon from '../../../../components/common/MantineIcon';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';
import {
    getResourceUrl,
    getResourceViewsSinceWhenDescription,
    getViewStatsResourceType,
} from '../../../../components/common/ResourceView/resourceUtils';
import ViewsCountPopover from '../../../../components/common/ViewsCountPopover';
import { useProjectUrlIdentifier } from '../../../../hooks/useProjectRoute';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import type { HomepageFavorite } from '../hooks/useHomepageFavorites';
import classes from './blockStyles.module.css';

type Props = {
    content: SummaryContent;
    projectUuid: string;
    onRemove?: () => void;
    star?: HomepageFavorite;
    /** `row`/`tile` are card-chrome variants; `compact` is a slim
     * single-line tile for dense grids. */
    variant?: 'row' | 'tile' | 'compact';
    /** Walkthrough anchor for the card, picked by the content's name. */
    tourAnchor?: string;
};

const VerifiedBadge: FC<{ content: SummaryContent }> = ({ content }) =>
    content.verification ? (
        <Tooltip label="Verified by the data team">
            <Box component="span" lh={0} c="green.6">
                <MantineIcon icon={IconCircleCheckFilled} size={15} />
            </Box>
        </Tooltip>
    ) : null;

const TileUpdated: FC<{ date: Date | string }> = ({ date }) => {
    const timeAgo = useTimeAgo(date, 60000);
    return <>updated {timeAgo}</>;
};

const TileExtra: FC<{ content: SummaryContent }> = ({ content }) => {
    const spaceName =
        'space' in content && content.space ? content.space.name : null;
    if (!spaceName && !content.lastUpdatedAt) return null;
    return (
        <Box className={classes.tileExtra}>
            {spaceName ? `in ${spaceName}` : null}
            {spaceName && content.lastUpdatedAt ? ' · ' : null}
            {content.lastUpdatedAt ? (
                <TileUpdated date={content.lastUpdatedAt} />
            ) : null}
        </Box>
    );
};

const CONTENT_KIND_LABEL: Record<SummaryContent['contentType'], string> = {
    [ContentType.CHART]: 'Chart',
    [ContentType.DASHBOARD]: 'Dashboard',
    [ContentType.SPACE]: 'Space',
    [ContentType.DATA_APP]: 'Data app',
    [ContentType.DOCUMENT]: 'Document',
};

const ViewsCount: FC<{ content: SummaryContent; projectUuid: string }> = ({
    content,
    projectUuid,
}) => {
    const item = contentToResourceViewItem(content);
    if (item.type === ResourceViewItemType.DOCUMENT) {
        return null;
    }
    return (
        <ViewsCountPopover
            resourceType={getViewStatsResourceType(item)}
            resourceUuid={content.uuid}
            projectUuid={projectUuid}
            views={content.views}
            fallbackTooltip={
                item.type === ResourceViewItemType.SPACE
                    ? undefined
                    : getResourceViewsSinceWhenDescription(item)
            }
        >
            <Group gap={4} wrap="nowrap" component="span">
                <MantineIcon icon={IconEye} size={12} color="dimmed" />
                <Text size="xs" c="dimmed" span>
                    {content.views}
                </Text>
            </Group>
        </ViewsCountPopover>
    );
};

const KindAndViews: FC<{ content: SummaryContent; projectUuid: string }> = ({
    content,
    projectUuid,
}) => (
    <Group gap={5} wrap="nowrap" className={classes.rowMeta}>
        <Text size="xs" c="dimmed" span>
            {CONTENT_KIND_LABEL[content.contentType]}
        </Text>
        {content.contentType !== ContentType.DOCUMENT && (
            <>
                <Text size="xs" c="dimmed" span>
                    ·
                </Text>
                <ViewsCount content={content} projectUuid={projectUuid} />
            </>
        )}
    </Group>
);

const ContentTitle: FC<Pick<Props, 'content' | 'star'>> = ({
    content,
    star,
}) => (
    <Group gap={4} wrap="nowrap" miw={0}>
        <Text size="sm" fw={600} truncate miw={0}>
            {content.name}
        </Text>
        <VerifiedBadge content={content} />
        {star && (
            <FavoriteActionIcon
                size="sm"
                isFavorite={star.isFavorite}
                name={content.name}
                disabled={star.isLoading}
                onToggle={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    star.onToggle();
                }}
            />
        )}
    </Group>
);

const CardActions: FC<Pick<Props, 'content' | 'onRemove'>> = ({
    content,
    onRemove,
}) => (
    <>
        {onRemove && (
            <ActionIcon
                size="sm"
                aria-label={`Remove ${content.name} from collection`}
                onClick={(e) => {
                    e.preventDefault();
                    onRemove();
                }}
            >
                <MantineIcon icon={IconX} />
            </ActionIcon>
        )}
    </>
);

const MaybeLink: FC<
    PropsWithChildren<{
        to: string | null;
        className: string;
        attrs?: Record<string, string>;
    }>
> = ({ to, className, attrs, children }) =>
    to ? (
        <Link
            to={to}
            className={`${className} ${classes.plainLink}`}
            onClick={(event) => {
                if (
                    event.target instanceof Element &&
                    event.target.closest('button')
                ) {
                    event.preventDefault();
                }
            }}
            {...attrs}
        >
            {children}
        </Link>
    ) : (
        <Box className={className} {...attrs}>
            {children}
        </Box>
    );

export const ContentCard: FC<Props> = ({
    content,
    projectUuid,
    onRemove,
    star,
    variant = 'row',
    tourAnchor,
}) => {
    const projectUrlIdentifier = useProjectUrlIdentifier();
    // Walkthrough anchor (data-tour-via), one card by its name.
    const tourAttrs = tourAnchor
        ? {
              'data-tour-anchor': tourAnchor,
              'data-tour-hint': 'Open a pinned item',
              'data-tour-hint-named': 'Open {value}',
              'data-tour-value': content.name,
          }
        : undefined;
    const to = onRemove
        ? null
        : getResourceUrl(
              projectUuid,
              contentToResourceViewItem(content),
              projectUrlIdentifier,
          );
    const cardClass = `${classes.hoverCard}${to ? ` ${classes.clickable}` : ''}`;

    // A single dense line — visibly lighter than the two-line card variant.
    if (variant === 'compact') {
        return (
            <MaybeLink
                to={to}
                className={`${classes.resTile}${to ? ` ${classes.clickable}` : ''}`}
                attrs={tourAttrs}
            >
                <ResourceIcon item={contentToResourceViewItem(content)} />
                <Box className={classes.resTileBody}>
                    <ContentTitle content={content} star={star} />
                </Box>
                <ViewsCount content={content} projectUuid={projectUuid} />
                {onRemove && (
                    <Box className={classes.tileActions}>
                        <CardActions content={content} onRemove={onRemove} />
                    </Box>
                )}
            </MaybeLink>
        );
    }

    if (variant === 'tile') {
        // Horizontal at half a card unit: two content tiles stack to exactly
        // one unit card, so mixed rows keep sharing horizontal edges.
        return (
            <MaybeLink
                to={to}
                className={`${cardClass} ${classes.cardUnitHalf} ${classes.contentTile}`}
                attrs={tourAttrs}
            >
                <ResourceIcon item={contentToResourceViewItem(content)} />
                <Box className={classes.tileBody}>
                    <ContentTitle content={content} star={star} />
                    <KindAndViews content={content} projectUuid={projectUuid} />
                    <TileExtra content={content} />
                </Box>
                {onRemove && (
                    <Box className={classes.tileActions}>
                        <CardActions content={content} onRemove={onRemove} />
                    </Box>
                )}
            </MaybeLink>
        );
    }

    return (
        <MaybeLink to={to} className={cardClass} attrs={tourAttrs}>
            <Group gap="sm" wrap="nowrap" align="center" p="sm" h="100%">
                <ResourceIcon item={contentToResourceViewItem(content)} />
                <Box flex={1} miw={0}>
                    <ContentTitle content={content} star={star} />
                    <KindAndViews content={content} projectUuid={projectUuid} />
                </Box>
                <CardActions content={content} onRemove={onRemove} />
            </Group>
        </MaybeLink>
    );
};
