import {
    type ApiError,
    type HomepageRecentlyViewedItem,
} from '@lightdash/common';
import { Badge, Card, Group, Skeleton, Stack, Text } from '@mantine-8/core';
import { useQuery } from '@tanstack/react-query';
import { type FC } from 'react';
import { lightdashApi } from '../../../../api';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import { useCollectionContent } from '../hooks/useCollectionContent';
import { ContentCard } from './ContentCard';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const getRecentlyViewed = async (projectUuid: string) =>
    lightdashApi<HomepageRecentlyViewedItem[]>({
        url: `/projects/${projectUuid}/homepage/recently-viewed`,
        method: 'GET',
        body: undefined,
    });

const useRecentlyViewed = (projectUuid: string) =>
    useQuery<HomepageRecentlyViewedItem[], ApiError>({
        queryKey: ['homepage_recently_viewed', projectUuid],
        queryFn: () => getRecentlyViewed(projectUuid),
    });

const ViewedAt: FC<{ date: Date }> = ({ date }) => {
    const timeAgo = useTimeAgo(date);
    return (
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {timeAgo}
        </Text>
    );
};

const RecentList: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: recents, isInitialLoading } = useRecentlyViewed(projectUuid);
    const uuids = (recents ?? []).map((item) => item.uuid);
    const { data: contents, isInitialLoading: isResolving } =
        useCollectionContent(projectUuid, uuids);

    if (isInitialLoading || isResolving) {
        return (
            <Stack gap="xs">
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} h={56} radius="md" />
                ))}
            </Stack>
        );
    }
    if (!contents || contents.length === 0) {
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
                Charts and dashboards you open will show up here.
            </Text>
        );
    }
    const viewedAtByUuid = new Map(
        (recents ?? []).map((item) => [item.uuid, item.viewedAt]),
    );
    return (
        <Card withBorder p="sm">
            <Stack gap="xs">
                {contents.map((content) => {
                    const viewedAt = viewedAtByUuid.get(content.uuid);
                    return (
                        <Group
                            key={content.uuid}
                            gap="sm"
                            wrap="nowrap"
                            align="center"
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <ContentCard
                                    content={content}
                                    projectUuid={projectUuid}
                                />
                            </div>
                            {viewedAt && <ViewedAt date={viewedAt} />}
                        </Group>
                    );
                })}
            </Stack>
        </Card>
    );
};

export const RecentBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'recent') return null;
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
            <RecentList projectUuid={projectUuid} />
        </Stack>
    );
};

export const RecentBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'recent') return null;
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
            <RecentList projectUuid={projectUuid} />
            <Text size="xs" c="dimmed">
                Showing your recent activity as a sample — every viewer sees
                their own.
            </Text>
        </Stack>
    );
};
