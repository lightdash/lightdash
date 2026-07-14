import {
    ContentType,
    contentToResourceViewItem,
    type SummaryContent,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Card,
    Group,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCircleCheckFilled,
    IconEye,
    IconStar,
    IconStarFilled,
    IconX,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';

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
};

export const ContentCard: FC<Props> = ({
    content,
    projectUuid,
    onRemove,
    star,
}) => {
    const card = (
        <Card withBorder p="sm" h="100%">
            <Group gap="sm" wrap="nowrap" align="flex-start">
                <ResourceIcon item={contentToResourceViewItem(content)} />
                <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={4} wrap="nowrap">
                        <Text size="sm" fw={600} truncate>
                            {content.name}
                        </Text>
                        {content.verification && (
                            <Tooltip label="Verified by the data team">
                                <MantineIcon
                                    icon={IconCircleCheckFilled}
                                    color="green"
                                />
                            </Tooltip>
                        )}
                    </Group>
                    <Group gap={4}>
                        <Text size="xs" c="dimmed" tt="capitalize">
                            {content.contentType}
                        </Text>
                        <Text size="xs" c="dimmed">
                            ·
                        </Text>
                        <MantineIcon icon={IconEye} color="gray" size="sm" />
                        <Text size="xs" c="dimmed">
                            {content.views}
                        </Text>
                    </Group>
                </Box>
                {star && (
                    <ActionIcon
                        variant="subtle"
                        color={star.isFavorite ? 'yellow' : 'gray'}
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
                        color="gray"
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
            </Group>
        </Card>
    );
    if (onRemove) return card;
    return (
        <Anchor
            component={Link}
            to={contentUrl(projectUuid, content)}
            underline="never"
            c="inherit"
        >
            {card}
        </Anchor>
    );
};
