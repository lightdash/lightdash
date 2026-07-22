import {
    assertUnreachable,
    FeatureFlags,
    RoadmapItemStatus,
    type RoadmapItem,
} from '@lightdash/common';
import {
    Accordion,
    Badge,
    Button,
    Group,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconBrandGithub,
    IconGitPullRequest,
    IconRoad,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useMemo, type FC } from 'react';
import { Navigate } from 'react-router';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize from 'rehype-sanitize';
import EmptyStateLoader from '../components/common/EmptyStateLoader';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useOrgRoadmap } from '../hooks/useOrgRoadmap';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import styles from './Roadmap.module.css';

const STATUS_ORDER: RoadmapItemStatus[] = [
    RoadmapItemStatus.BUILDING,
    RoadmapItemStatus.PLANNED,
    RoadmapItemStatus.BACKLOG,
    RoadmapItemStatus.SHIPPED,
    RoadmapItemStatus.NOT_PLANNED,
];

const getStatusColor = (status: RoadmapItemStatus): string => {
    switch (status) {
        case RoadmapItemStatus.BUILDING:
            return 'blue';
        case RoadmapItemStatus.PLANNED:
            return 'violet';
        case RoadmapItemStatus.SHIPPED:
            return 'green';
        case RoadmapItemStatus.BACKLOG:
        case RoadmapItemStatus.NOT_PLANNED:
            return 'ldGray';
        default:
            return assertUnreachable(status, `Unknown status ${status}`);
    }
};

const RoadmapItemLinks: FC<{ item: RoadmapItem }> = ({ item }) => {
    if (!item.issueUrl && !item.pullRequestUrl) {
        return null;
    }
    return (
        <Group gap="xs">
            {item.issueUrl && (
                <Button
                    component="a"
                    href={item.issueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="default"
                    size="compact-xs"
                    leftSection={<MantineIcon icon={IconBrandGithub} />}
                >
                    View issue
                </Button>
            )}
            {item.pullRequestUrl && (
                <Button
                    component="a"
                    href={item.pullRequestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="default"
                    size="compact-xs"
                    leftSection={<MantineIcon icon={IconGitPullRequest} />}
                >
                    View pull request
                </Button>
            )}
        </Group>
    );
};

const RoadmapItemPanel: FC<{ item: RoadmapItem }> = ({ item }) => {
    const theme = useMantineTheme();
    return (
        <Stack gap="sm">
            {item.description ? (
                <MarkdownPreview
                    source={item.description}
                    rehypePlugins={[
                        rehypeSanitize,
                        [rehypeExternalLinks, { target: '_blank' }],
                    ]}
                    style={{
                        fontSize: theme.fontSizes.sm,
                        backgroundColor: 'inherit',
                        color: 'inherit',
                    }}
                />
            ) : (
                <Text c="ldGray.6" fz="sm">
                    No further detail on this request yet.
                </Text>
            )}
            <RoadmapItemLinks item={item} />
        </Stack>
    );
};

const RoadmapStatusSection: FC<{
    status: RoadmapItemStatus;
    items: RoadmapItem[];
}> = ({ status, items }) => (
    <Stack gap="xs">
        <Group gap="xs">
            <Title order={4}>{status}</Title>
            <Text c="ldGray.6" fz="sm">
                {items.length}
            </Text>
        </Group>
        <Accordion
            variant="separated"
            radius="md"
            chevronPosition="right"
            multiple
        >
            {items.map((item, index) => (
                <Accordion.Item
                    // Curated items expose no id, and titles can repeat.
                    key={`${status}-${index}`}
                    value={`${status}-${index}`}
                    className={styles.item}
                >
                    <Accordion.Control>
                        <Group gap="sm" wrap="nowrap">
                            <Badge
                                color={getStatusColor(item.status)}
                                variant="light"
                                size="sm"
                                flex="none"
                            >
                                {item.status}
                            </Badge>
                            <Text fw={500} fz="sm" lineClamp={1}>
                                {item.title}
                            </Text>
                        </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <RoadmapItemPanel item={item} />
                    </Accordion.Panel>
                </Accordion.Item>
            ))}
        </Accordion>
    </Stack>
);

const Roadmap: FC = () => {
    const flagQuery = useServerFeatureFlag(FeatureFlags.Roadmap);
    const roadmapQuery = useOrgRoadmap(flagQuery.data?.enabled === true);

    const sections = useMemo(() => {
        const items = roadmapQuery.data ?? [];
        return STATUS_ORDER.map((status) => ({
            status,
            items: items.filter((item) => item.status === status),
        })).filter((section) => section.items.length > 0);
    }, [roadmapQuery.data]);

    if (flagQuery.isInitialLoading) {
        return <EmptyStateLoader />;
    }

    if (!flagQuery.data?.enabled) {
        return <Navigate to="/" replace />;
    }

    return (
        <Page title="Roadmap" withFixedContent withPaddedContent>
            <Stack gap="lg">
                <Stack gap="xs">
                    <Title order={2}>Roadmap</Title>
                    <Text c="ldGray.6">
                        Every feature request your organization has raised with
                        Lightdash, and where each one stands.
                    </Text>
                </Stack>

                {roadmapQuery.isInitialLoading ? (
                    <EmptyStateLoader title="Loading your roadmap" />
                ) : roadmapQuery.isError ? (
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Could not load your roadmap"
                        description="Something went wrong fetching your roadmap. Try again in a few minutes, or contact support if it keeps happening."
                    />
                ) : sections.length === 0 ? (
                    <SuboptimalState
                        icon={IconRoad}
                        title="No roadmap items yet"
                        description="When your organization raises feature requests with Lightdash, they'll show up here with their current status."
                    />
                ) : (
                    sections.map((section) => (
                        <RoadmapStatusSection
                            key={section.status}
                            status={section.status}
                            items={section.items}
                        />
                    ))
                )}
            </Stack>
        </Page>
    );
};

export default Roadmap;
