import {
    ContentType,
    contentToResourceViewItem,
    type SummaryContent,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine-8/core';
import {
    IconCircleCheckFilled,
    IconEye,
    IconStar,
    IconStarFilled,
    IconX,
} from '@tabler/icons-react';
import { type FC, type PropsWithChildren } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import classes from './blockStyles.module.css';

const contentUrl = (projectUuid: string, content: SummaryContent): string => {
    switch (content.contentType) {
        case ContentType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${content.uuid}/view`;
        case ContentType.SPACE:
            return `/projects/${projectUuid}/spaces/${content.uuid}`;
        default:
            return `/projects/${projectUuid}/saved/${content.uuid}`;
    }
};

type Props = {
    content: SummaryContent;
    projectUuid: string;
    onRemove?: () => void;
    star?: { isFavorite: boolean; onToggle: () => void };
    variant?: 'row' | 'tile';
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

const KindAndViews: FC<{ content: SummaryContent }> = ({ content }) => (
    <Group gap={5} wrap="nowrap" className={classes.rowMeta}>
        <Text size="xs" c="dimmed" tt="capitalize" span>
            {content.contentType}
        </Text>
        <Text size="xs" c="dimmed" span>
            ·
        </Text>
        <MantineIcon icon={IconEye} size={12} color="ldGray.6" />
        <Text size="xs" c="dimmed" span>
            {content.views}
        </Text>
    </Group>
);

const CardActions: FC<Pick<Props, 'content' | 'onRemove' | 'star'>> = ({
    content,
    onRemove,
    star,
}) => (
    <>
        {star && (
            <ActionIcon
                variant="subtle"
                color={star.isFavorite ? 'yellow' : 'ldGray.6'}
                size="sm"
                aria-label={
                    star.isFavorite
                        ? `Remove ${content.name} from favorites`
                        : `Add ${content.name} to favorites`
                }
                onClick={(e) => {
                    e.preventDefault();
                    star.onToggle();
                }}
            >
                <MantineIcon
                    icon={star.isFavorite ? IconStarFilled : IconStar}
                />
            </ActionIcon>
        )}
        {onRemove && (
            <ActionIcon
                variant="subtle"
                color="ldGray.6"
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
    const to = onRemove ? null : contentUrl(projectUuid, content);
    const cardClass = `${classes.hoverCard}${to ? ` ${classes.clickable}` : ''}`;

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
                    <KindAndViews content={content} />
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
                    <KindAndViews content={content} />
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
