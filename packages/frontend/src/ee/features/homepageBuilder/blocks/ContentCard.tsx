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
        <div className={className}>{children}</div>
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
        return (
            <MaybeLink to={to} className={`${cardClass} ${classes.cardUnit1}`}>
                <Box p={14} h="100%">
                    <Group
                        justify="space-between"
                        align="flex-start"
                        mb={10}
                        wrap="nowrap"
                    >
                        <ResourceIcon
                            item={contentToResourceViewItem(content)}
                        />
                        <CardActions
                            content={content}
                            onRemove={onRemove}
                            star={star}
                        />
                    </Group>
                    <Group gap={5} wrap="nowrap" mb={2}>
                        <Text size="sm" fw={600} truncate>
                            {content.name}
                        </Text>
                        <VerifiedBadge content={content} />
                    </Group>
                    <KindAndViews content={content} />
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
