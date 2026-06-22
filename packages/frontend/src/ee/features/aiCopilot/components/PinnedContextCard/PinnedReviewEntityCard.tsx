import {
    assertUnreachable,
    type AiAgentReviewItemPrState,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Collapse,
    Group,
    Stack,
    Text,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconChevronRight,
    IconFlask,
    IconGitPullRequest,
    IconPencil,
    IconSearch,
} from '@tabler/icons-react';
import { type FC, Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './PinnedReviewEntityCard.module.css';
import { type ReviewEntityItem } from './reviewEntityItem';

const PR_STATE_COLORS: Record<AiAgentReviewItemPrState, string> = {
    open: 'teal',
    merged: 'violet',
    closed: 'gray',
};

// One row: a muted icon column + the entity's content. No own chrome — the
// surrounding group provides the (single, subtle) container.
const Row: FC<{
    icon: typeof IconSearch;
    right?: ReactNode;
    children: ReactNode;
}> = ({ icon, right, children }) => (
    <Group gap={8} wrap="nowrap" align="flex-start">
        <MantineIcon
            icon={icon}
            size={13}
            color="dimmed"
            style={{ marginTop: 2, flexShrink: 0 }}
        />
        <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
        {right}
    </Group>
);

const PullRequestRow: FC<{
    item: Extract<ReviewEntityItem, { type: 'pull_request' }>;
}> = ({ item }) => {
    const status = item.status ?? 'open';
    return (
        <Row
            icon={IconGitPullRequest}
            right={
                <Badge
                    color={PR_STATE_COLORS[status]}
                    variant="light"
                    size="xs"
                    radius="sm"
                >
                    {status}
                </Badge>
            }
        >
            <Anchor
                href={item.prUrl}
                target="_blank"
                rel="noreferrer"
                fz="xs"
                c="ldGray.8"
                lineClamp={2}
            >
                {item.title ?? `#${item.prNumber ?? '?'}`}
            </Anchor>
        </Row>
    );
};

const ProposedChangeRow: FC<{
    item: Extract<ReviewEntityItem, { type: 'proposed_change' }>;
}> = ({ item }) => {
    const { payload } = item;
    const summary =
        payload.changeKind === 'project_context'
            ? payload.entry.content
            : payload.recommendation.title;
    return (
        <Row icon={IconPencil}>
            <Text className={styles.eyebrow}>Proposed change</Text>
            <Text fz="xs" c="ldGray.8">
                {summary}
            </Text>
        </Row>
    );
};

const ReviewFindingRow: FC<{
    item: Extract<ReviewEntityItem, { type: 'review_finding' }>;
}> = ({ item }) => {
    const [evidenceOpen, { toggle: toggleEvidence }] = useDisclosure(false);
    const hasEvidence = item.evidenceExcerpts.length > 0;
    return (
        <Row
            icon={IconSearch}
            right={
                item.findingCount > 1 ? (
                    <Text fz={10} fw={600} c="dimmed" style={{ flexShrink: 0 }}>
                        {item.findingCount}×
                    </Text>
                ) : undefined
            }
        >
            <Text fz="xs" fw={500} c="ldGray.8">
                {item.title}
            </Text>
            {hasEvidence && (
                <>
                    <Anchor
                        component="button"
                        type="button"
                        onClick={toggleEvidence}
                        fz={11}
                        c="dimmed"
                        underline="never"
                        mt={2}
                    >
                        <Group gap={2} wrap="nowrap" align="center">
                            <MantineIcon
                                icon={IconChevronRight}
                                size={11}
                                className={`${styles.chevron}${
                                    evidenceOpen ? ` ${styles.chevronOpen}` : ''
                                }`}
                            />
                            Evidence ({item.evidenceExcerpts.length})
                        </Group>
                    </Anchor>
                    <Collapse in={evidenceOpen}>
                        <Stack
                            gap={4}
                            mt={4}
                            pl="xs"
                            className={styles.evidenceList}
                        >
                            {item.evidenceExcerpts.map((excerpt, idx) => (
                                <Text
                                    key={idx}
                                    fz={11}
                                    c="dimmed"
                                    className={
                                        excerpt.redacted
                                            ? styles.redacted
                                            : undefined
                                    }
                                >
                                    {excerpt.redacted
                                        ? '[redacted]'
                                        : excerpt.text}
                                </Text>
                            ))}
                        </Stack>
                    </Collapse>
                </>
            )}
        </Row>
    );
};

const PreviewEnvironmentRow: FC<{
    item: Extract<ReviewEntityItem, { type: 'preview_environment' }>;
}> = ({ item }) => {
    const to = item.previewThreadUuid
        ? `/projects/${item.previewProjectUuid}/ai-agents/threads/${item.previewThreadUuid}`
        : `/projects/${item.previewProjectUuid}/home`;
    return (
        <Row
            icon={IconFlask}
            right={
                item.status ? (
                    <Badge color="cyan" variant="light" size="xs" radius="sm">
                        {item.status}
                    </Badge>
                ) : undefined
            }
        >
            <Anchor
                component={Link}
                to={to}
                target="_blank"
                rel="noreferrer"
                fz="xs"
                c="ldGray.8"
            >
                {item.projectName ?? 'Preview environment'}
            </Anchor>
        </Row>
    );
};

const EntityRow: FC<{ item: ReviewEntityItem }> = ({ item }) => {
    switch (item.type) {
        case 'pull_request':
            return <PullRequestRow item={item} />;
        case 'proposed_change':
            return <ProposedChangeRow item={item} />;
        case 'review_finding':
            return <ReviewFindingRow item={item} />;
        case 'preview_environment':
            return <PreviewEnvironmentRow item={item} />;
        default:
            return assertUnreachable(item, 'Unknown review entity row type');
    }
};

// The review entities share a single quiet container, stacked and hairline-
// divided, rather than one loud card each.
export const PinnedReviewContextGroup: FC<{ items: ReviewEntityItem[] }> = ({
    items,
}) => {
    if (items.length === 0) return null;
    return (
        <Stack gap={0} className={styles.group}>
            {items.map((item, idx) => (
                <Fragment key={idx}>
                    {idx > 0 && <Box className={styles.divider} />}
                    <Box className={styles.row}>
                        <EntityRow item={item} />
                    </Box>
                </Fragment>
            ))}
        </Stack>
    );
};

// Standalone single-entity render (group of one) for callers that pin one item.
export const PinnedReviewEntityCard: FC<{ item: ReviewEntityItem }> = ({
    item,
}) => <PinnedReviewContextGroup items={[item]} />;
