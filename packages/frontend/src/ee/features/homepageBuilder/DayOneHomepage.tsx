import {
    ContentSortByColumns,
    ContentType,
    type SummaryContent,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconChartBar,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useFavoriteMutation } from '../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../hooks/favorites/useFavorites';
import { useInfiniteContent } from '../../../hooks/useContent';
import useApp from '../../../providers/App/useApp';
import AiSearchBox from '../../components/Home/AiSearchBox';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { ContentCard } from './blocks/ContentCard';
import { getDefaultQuickActions } from './blocks/quickActionDefaults';
import { QuickActionCards } from './blocks/QuickActionsBlock';

type DiscoverGroupDefinition = {
    key: string;
    label: string;
    contentType: ContentType;
    browseUrl: (projectUuid: string) => string;
};

const DISCOVER_GROUPS: DiscoverGroupDefinition[] = [
    {
        key: 'dashboards',
        label: 'Dashboards',
        contentType: ContentType.DASHBOARD,
        browseUrl: (projectUuid) => `/projects/${projectUuid}/dashboards`,
    },
    {
        key: 'charts',
        label: 'Charts',
        contentType: ContentType.CHART,
        browseUrl: (projectUuid) => `/projects/${projectUuid}/saved`,
    },
    {
        key: 'spaces',
        label: 'Spaces',
        contentType: ContentType.SPACE,
        browseUrl: (projectUuid) => `/projects/${projectUuid}/spaces`,
    },
];

const useDiscoverContent = (projectUuid: string, contentType: ContentType) =>
    useInfiniteContent({
        projectUuids: [projectUuid],
        contentTypes: [contentType],
        pageSize: 6,
        sortBy: ContentSortByColumns.VIEWS,
        sortDirection: 'desc',
    });

const GroupSection: FC<{
    definition: DiscoverGroupDefinition;
    projectUuid: string;
    favoriteUuids: Set<string>;
    onToggleFavorite: (content: SummaryContent) => void;
}> = ({ definition, projectUuid, favoriteUuids, onToggleFavorite }) => {
    const { data, isInitialLoading } = useDiscoverContent(
        projectUuid,
        definition.contentType,
    );
    const items = (data?.pages ?? []).flatMap((page) => page.data);
    const total = data?.pages[0]?.pagination?.totalResults ?? 0;
    if (!isInitialLoading && total === 0) return null;
    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                    {definition.label}
                </Text>
                <Text size="xs" c="dimmed">
                    {total}
                </Text>
                <Box style={{ flex: 1 }} />
                <Anchor
                    component={Link}
                    to={definition.browseUrl(projectUuid)}
                    size="xs"
                    fw={500}
                >
                    Browse all
                </Anchor>
            </Group>
            {isInitialLoading ? (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} h={72} radius="md" />
                    ))}
                </SimpleGrid>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    {items.map((content) => (
                        <ContentCard
                            key={content.uuid}
                            content={content}
                            projectUuid={projectUuid}
                            star={{
                                isFavorite: favoriteUuids.has(content.uuid),
                                onToggle: () => onToggleFavorite(content),
                            }}
                        />
                    ))}
                </SimpleGrid>
            )}
        </Stack>
    );
};

type Props = {
    projectUuid: string;
    projectName: string;
};

export const DayOneHomepage: FC<Props> = ({ projectUuid, projectName }) => {
    const { user } = useApp();
    const isAiEnabled = useAiAgentButtonVisibility();
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    const favoriteUuids = new Set(
        (favorites ?? []).map((item) => item.data.uuid),
    );

    const handleToggleFavorite = (content: SummaryContent) => {
        toggleFavorite({
            contentType: content.contentType,
            contentUuid: content.uuid,
        });
    };

    return (
        <Stack gap="xl">
            {isAiEnabled ? (
                <Stack gap="md" align="center" py="lg">
                    <Title order={1} fw={600} ta="center">
                        What do you want to know, {user.data?.firstName}?
                    </Title>
                    <Text c="dimmed" ta="center">
                        Ask in plain English — the agent queries your governed
                        metrics and builds the chart.
                    </Text>
                    <Box w="100%" maw={720}>
                        <AiSearchBox projectUuid={projectUuid} />
                    </Box>
                </Stack>
            ) : (
                <Stack gap="md">
                    <Box>
                        <Title order={2} fw={600}>
                            Welcome to {projectName}, {user.data?.firstName}
                        </Title>
                        <Text c="dimmed" size="sm">
                            Nothing’s curated here yet — start exploring, or
                            your data team can build this page.
                        </Text>
                    </Box>
                    <QuickActionCards
                        actions={getDefaultQuickActions(false)}
                        projectUuid={projectUuid}
                    />
                </Stack>
            )}

            <Stack gap="md">
                <Box>
                    <Title order={4} fw={600}>
                        Explore your workspace
                    </Title>
                    <Text size="xs" c="dimmed">
                        Everything the data team has published, grouped by type.
                        Star anything to keep it handy.
                    </Text>
                </Box>
                <Group gap="xs">
                    <Button
                        variant={typeFilter === null ? 'filled' : 'default'}
                        size="compact-xs"
                        onClick={() => setTypeFilter(null)}
                    >
                        All
                    </Button>
                    {DISCOVER_GROUPS.map((definition) => (
                        <Button
                            key={definition.key}
                            variant={
                                typeFilter === definition.key
                                    ? 'filled'
                                    : 'default'
                            }
                            size="compact-xs"
                            leftSection={
                                <MantineIcon
                                    icon={
                                        definition.contentType ===
                                        ContentType.DASHBOARD
                                            ? IconLayoutDashboard
                                            : definition.contentType ===
                                                ContentType.CHART
                                              ? IconChartBar
                                              : IconFolder
                                    }
                                />
                            }
                            onClick={() =>
                                setTypeFilter((current) =>
                                    current === definition.key
                                        ? null
                                        : definition.key,
                                )
                            }
                        >
                            {definition.label}
                        </Button>
                    ))}
                </Group>
                {DISCOVER_GROUPS.filter(
                    (definition) =>
                        typeFilter === null || typeFilter === definition.key,
                ).map((definition) => (
                    <GroupSection
                        key={definition.key}
                        definition={definition}
                        projectUuid={projectUuid}
                        favoriteUuids={favoriteUuids}
                        onToggleFavorite={handleToggleFavorite}
                    />
                ))}
            </Stack>
        </Stack>
    );
};
