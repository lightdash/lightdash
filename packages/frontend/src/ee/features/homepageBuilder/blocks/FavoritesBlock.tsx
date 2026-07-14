import { ResourceViewItemType, type ResourceViewItem } from '@lightdash/common';
import { ActionIcon, Anchor, Badge, Group, Stack, Text } from '@mantine-8/core';
import {
    IconChartBar,
    IconFolder,
    IconLayoutDashboard,
    IconStarFilled,
    IconTerminal2,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useFavoriteMutation } from '../../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';
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
}> = ({ projectUuid, isInteractive }) => {
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);

    if (!favorites || favorites.length === 0) {
        return (
            <Text
                size="xs"
                c="dimmed"
                p="sm"
                style={{
                    border: '1px dashed var(--mantine-color-gray-4)',
                    borderRadius: 8,
                }}
            >
                Star any dashboard or chart to keep it here — each person sees
                their own favorites.
            </Text>
        );
    }

    return (
        <Group gap="xs">
            {favorites.map((item) => (
                <Anchor
                    key={item.data.uuid}
                    component={Link}
                    to={favoriteUrl(projectUuid, item)}
                    underline="never"
                    c="inherit"
                >
                    <Group
                        gap={6}
                        px="sm"
                        py={6}
                        style={{
                            border: '1px solid var(--mantine-color-gray-3)',
                            borderRadius: 8,
                        }}
                        wrap="nowrap"
                    >
                        <MantineIcon
                            icon={FAVORITE_ICONS[item.type] ?? IconChartBar}
                            color="gray"
                        />
                        <Text size="sm" fw={500}>
                            {item.data.name}
                        </Text>
                        {isInteractive ? (
                            <ActionIcon
                                variant="transparent"
                                color="yellow"
                                size="xs"
                                aria-label={`Remove ${item.data.name} from favorites`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    toggleFavorite({
                                        contentType: item.type,
                                        contentUuid: item.data.uuid,
                                    });
                                }}
                            >
                                <MantineIcon icon={IconStarFilled} />
                            </ActionIcon>
                        ) : (
                            <MantineIcon
                                icon={IconStarFilled}
                                color="yellow"
                                size="sm"
                            />
                        )}
                    </Group>
                </Anchor>
            ))}
        </Group>
    );
};

export const FavoritesBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'favorites') return null;
    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                    {block.config.title}
                </Text>
                <Badge variant="default" size="xs" tt="none">
                    Only you see this
                </Badge>
            </Group>
            <FavoritePills projectUuid={projectUuid} isInteractive />
        </Stack>
    );
};

export const FavoritesBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'favorites') return null;
    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                    {block.config.title}
                </Text>
                <Badge variant="default" size="xs" tt="none">
                    Personal per viewer
                </Badge>
            </Group>
            <FavoritePills projectUuid={projectUuid} isInteractive={false} />
            <Text size="xs" c="dimmed">
                Showing your favorites as a sample — every viewer sees their
                own.
            </Text>
        </Stack>
    );
};
