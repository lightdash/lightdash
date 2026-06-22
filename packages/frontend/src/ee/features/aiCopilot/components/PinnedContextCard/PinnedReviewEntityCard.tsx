import {
    assertUnreachable,
    type AiAgentReviewItemPrState,
    type AiPromptContextItem,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Card,
    Collapse,
    Group,
    Stack,
    Text,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronRight,
    IconFlask,
    IconGitPullRequest,
    IconPencil,
    IconSearch,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    reviewRootCauseColors,
    reviewRootCauseLabels,
} from '../Admin/reviewItemDetails';
import styles from './PinnedReviewEntityCard.module.css';

type ReviewEntityItem = Extract<
    AiPromptContextItem,
    {
        type:
            | 'pull_request'
            | 'proposed_change'
            | 'review_finding'
            | 'preview_environment';
    }
>;

type Props = {
    item: ReviewEntityItem;
};

const PR_STATE_COLORS: Record<AiAgentReviewItemPrState, string> = {
    open: 'teal',
    merged: 'violet',
    closed: 'gray',
};

const CardShell: FC<{ children: React.ReactNode }> = ({ children }) => (
    <Card className={styles.card} p="xs" radius="md" withBorder={false}>
        {children}
    </Card>
);

const PullRequestCard: FC<{
    item: Extract<ReviewEntityItem, { type: 'pull_request' }>;
}> = ({ item }) => {
    const status = item.status ?? 'open';
    return (
        <CardShell>
            <Group gap="xs" wrap="nowrap" align="center">
                <MantineIcon
                    icon={IconGitPullRequest}
                    color="teal.7"
                    size={14}
                />
                <Anchor
                    href={item.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    fz="xs"
                    fw={600}
                    c="ldGray.8"
                >
                    PR #{item.prNumber ?? '?'}
                </Anchor>
                <Badge
                    color={PR_STATE_COLORS[status]}
                    variant="light"
                    size="sm"
                >
                    {status}
                </Badge>
            </Group>
            {item.title && (
                <Text fz="xs" c="ldGray.7" mt="two" lineClamp={2}>
                    {item.title}
                </Text>
            )}
        </CardShell>
    );
};

const ProposedChangeCard: FC<{
    item: Extract<ReviewEntityItem, { type: 'proposed_change' }>;
}> = ({ item }) => {
    const { payload } = item;
    const isProjectContext = payload.changeKind === 'project_context';
    const summary =
        payload.changeKind === 'project_context'
            ? payload.entry.content
            : payload.recommendation.title;
    return (
        <CardShell>
            <Group gap="xs" wrap="nowrap" align="center" mb="two">
                <MantineIcon icon={IconPencil} color="violet.7" size={14} />
                <Text fz="xs" fw={600} c="ldGray.7" tt="uppercase">
                    Proposed change
                </Text>
                <Badge
                    color={
                        isProjectContext
                            ? reviewRootCauseColors.project_context
                            : reviewRootCauseColors.semantic_layer
                    }
                    variant="light"
                    size="sm"
                >
                    {isProjectContext
                        ? reviewRootCauseLabels.project_context
                        : reviewRootCauseLabels.semantic_layer}
                </Badge>
            </Group>
            <Text fz="xs" c="ldGray.8">
                {summary}
            </Text>
        </CardShell>
    );
};

const ReviewFindingCard: FC<{
    item: Extract<ReviewEntityItem, { type: 'review_finding' }>;
}> = ({ item }) => {
    const [evidenceOpen, { toggle: toggleEvidence }] = useDisclosure(false);
    const hasEvidence = item.evidenceExcerpts.length > 0;
    return (
        <CardShell>
            <Group gap="xs" wrap="nowrap" align="center" mb="two">
                <MantineIcon icon={IconSearch} color="orange.7" size={14} />
                <Badge
                    color={reviewRootCauseColors[item.rootCause]}
                    variant="light"
                    size="sm"
                >
                    {reviewRootCauseLabels[item.rootCause]}
                </Badge>
                {item.findingCount > 1 && (
                    <Badge color="gray" variant="light" size="sm">
                        {item.findingCount}×
                    </Badge>
                )}
            </Group>
            <Text fz="xs" fw={500} c="ldGray.8">
                {item.title}
            </Text>
            {hasEvidence && (
                <Stack gap="two" mt="xs">
                    <Anchor
                        component="button"
                        type="button"
                        onClick={toggleEvidence}
                        fz="xs"
                        c="ldGray.6"
                    >
                        <Group gap={4} wrap="nowrap" align="center">
                            <MantineIcon
                                icon={
                                    evidenceOpen
                                        ? IconChevronDown
                                        : IconChevronRight
                                }
                                size={12}
                            />
                            Evidence ({item.evidenceExcerpts.length})
                        </Group>
                    </Anchor>
                    <Collapse in={evidenceOpen}>
                        <Stack gap="two">
                            {item.evidenceExcerpts.map((excerpt, idx) => (
                                <Text
                                    key={idx}
                                    fz="xs"
                                    c="ldGray.7"
                                    className={
                                        excerpt.redacted
                                            ? `${styles.evidenceText} ${styles.redacted}`
                                            : styles.evidenceText
                                    }
                                >
                                    {excerpt.redacted
                                        ? '[redacted]'
                                        : excerpt.text}
                                </Text>
                            ))}
                        </Stack>
                    </Collapse>
                </Stack>
            )}
        </CardShell>
    );
};

const PreviewEnvironmentCard: FC<{
    item: Extract<ReviewEntityItem, { type: 'preview_environment' }>;
}> = ({ item }) => {
    const to = item.previewThreadUuid
        ? `/projects/${item.previewProjectUuid}/ai-agents/threads/${item.previewThreadUuid}`
        : `/projects/${item.previewProjectUuid}/home`;
    return (
        <CardShell>
            <Group gap="xs" wrap="nowrap" align="center">
                <MantineIcon icon={IconFlask} color="cyan.7" size={14} />
                <Anchor
                    component={Link}
                    to={to}
                    target="_blank"
                    rel="noreferrer"
                    fz="xs"
                    fw={600}
                    c="ldGray.8"
                >
                    {item.projectName ?? 'Preview environment'}
                </Anchor>
                {item.status && (
                    <Badge color="cyan" variant="light" size="sm">
                        {item.status}
                    </Badge>
                )}
            </Group>
        </CardShell>
    );
};

export const PinnedReviewEntityCard: FC<Props> = ({ item }) => {
    switch (item.type) {
        case 'pull_request':
            return <PullRequestCard item={item} />;
        case 'proposed_change':
            return <ProposedChangeCard item={item} />;
        case 'review_finding':
            return <ReviewFindingCard item={item} />;
        case 'preview_environment':
            return <PreviewEnvironmentCard item={item} />;
        default:
            return assertUnreachable(item, 'Unknown review entity card type');
    }
};
