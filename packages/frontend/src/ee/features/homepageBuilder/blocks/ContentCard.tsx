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
import classes from './blockStyles.module.css';

type Props = {
    content: SummaryContent;
    projectUuid: string;
    onRemove?: () => void;
    star?: { isFavorite: boolean; onToggle: () => void };
    /** `row`/`tile` are card-chrome variants; `compact` is a slim
     * single-line tile for dense grids. */
    variant?: 'row' | 'tile' | 'compact';
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
    [ContentType.DATA_APP]: 'App',
};

const ViewsCount: FC<{ content: SummaryContent; projectUuid: string }> = ({
    content,
    projectUuid,
}) => {
    const item = contentToResourceViewItem(content);
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
        <Text size="xs" c="dimmed" span>
            ·
        </Text>
        <ViewsCount content={content} projectUuid={projectUuid} />
    </Group>
);

const CardActions: FC<Pick<Props, 'content' | 'onRemove' | 'star'>> = ({
    content,
    onRemove,
    star,
}) => (
    <>
        {star && (
            <FavoriteActionIcon
                size="sm"
                isFavorite={star.isFavorite}
                name={content.name}
                onToggle={(e) => {
                    e.preventDefault();
                    star.onToggle();
                }}
            />
        )}
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
    PropsWithChildren<{ to: string | null; className: string }>
> = ({ to, className, children }) =>
    to ? (
        <Link to={to} className={`${className} ${classes.plainLink}`}>
            {children}
        </Link>
    ) : (
        <Box className={className}>{children}</Box>
    );

export const ContentCard: FC<Props> = ({
    content,
    projectUuid,
    onRemove,
    star,
    variant = 'row',
}) => {
    const projectUrlIdentifier = useProjectUrlIdentifier();
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
            >
                <ResourceIcon item={contentToResourceViewItem(content)} />
                <Group gap={5} wrap="nowrap" className={classes.resTileBody}>
                    <Text size="sm" fw={600} truncate>
                        {content.name}
                    </Text>
                    <VerifiedBadge content={content} />
                </Group>
                <ViewsCount content={content} projectUuid={projectUuid} />
                <Box className={classes.tileActions}>
                    <CardActions
                        content={content}
                        onRemove={onRemove}
                        star={star}
                    />
                </Box>
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
            >
                <ResourceIcon item={contentToResourceViewItem(content)} />
                <Box className={classes.tileBody}>
                    <Group gap={5} wrap="nowrap">
                        <Text size="sm" fw={600} truncate>
                            {content.name}
                        </Text>
                        <VerifiedBadge content={content} />
                    </Group>
                    <KindAndViews content={content} projectUuid={projectUuid} />
                    <TileExtra content={content} />
                </Box>
                <Box className={classes.tileActions}>
                    <CardActions
                        content={content}
                        onRemove={onRemove}
                        star={star}
                    />
                </Box>
            </MaybeLink>
        );
    }

    return (
        <MaybeLink to={to} className={cardClass}>
            <Group gap="sm" wrap="nowrap" align="center" p="sm" h="100%">
                <ResourceIcon item={contentToResourceViewItem(content)} />
                <Box flex={1} miw={0}>
                    <Group gap={4} wrap="nowrap">
                        <Text size="sm" fw={600} truncate>
                            {content.name}
                        </Text>
                        <VerifiedBadge content={content} />
                    </Group>
                    <KindAndViews content={content} projectUuid={projectUuid} />
                </Box>
                <CardActions
                    content={content}
                    onRemove={onRemove}
                    star={star}
                />
            </Group>
        </MaybeLink>
    );
};
