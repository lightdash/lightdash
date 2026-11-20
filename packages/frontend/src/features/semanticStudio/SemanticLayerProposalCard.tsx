import {
    type ModelFragmentChange,
    type SemanticLayerProposal,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    Text,
    ThemeIcon,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowsDiagonal,
    IconArrowsDiagonalMinimize2,
    IconArrowUpRight,
    IconGitPullRequest,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import { TableIcon } from '../../components/common/ContentIcons';
import MantineIcon from '../../components/common/MantineIcon';
import { ChangeDiff } from './ChangeDiff';
import {
    describeModelChange,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    summarizeModelChanges,
} from './modelCode';
import { ISSUE_KINDS, listProposalIssues, type Issue } from './proposalIssues';
import classes from './SemanticLayerProposalCard.module.css';
import { Task } from './TaskRow';
import { getSemanticStudioUrl } from './urls';
import {
    useDiscardDraftChange,
    useRefreshSemanticLayerDraft,
    useSemanticLayerDraft,
} from './useSemanticLayerModel';

type Diff = SemanticLayerProposal['diffs'][number];

const CodePeek: FC<{ diff: Diff }> = ({ diff }) => {
    const [isOpen, { open, toggle }] = useDisclosure(false);
    const label = isOpen ? 'Show less' : 'Show all';
    return (
        <Box className={classes.code}>
            <Tooltip label={label}>
                <ActionIcon
                    className={classes.reveal}
                    size="sm"
                    aria-label={label}
                    onClick={toggle}
                >
                    <MantineIcon
                        icon={
                            isOpen
                                ? IconArrowsDiagonalMinimize2
                                : IconArrowsDiagonal
                        }
                    />
                </ActionIcon>
            </Tooltip>
            <Box
                className={classes.codeBody}
                data-open={isOpen}
                onClick={isOpen ? undefined : open}
            >
                <ChangeDiff
                    modelName={diff.model}
                    change={diff}
                    variant={isOpen ? 'compact' : 'peek'}
                />
            </Box>
        </Box>
    );
};

const ModelSection: FC<{
    model: string;
    changes: ModelFragmentChange[];
    diff: Diff | undefined;
    status: string | null;
    actions: ReactNode;
}> = ({ model, changes, diff, status, actions }) => {
    const { title, subtitle } = describeModelChange(model, diff ?? null);
    const lines = diff?.contentBefore
        ? summarizeModelChanges(model, changes)
        : [];
    return (
        <Box className={classes.section}>
            <Group className={classes.header} gap="xs" wrap="nowrap">
                <ThemeIcon variant="light" color="indigo" size={24} radius="sm">
                    <MantineIcon icon={TableIcon} size={14} />
                </ThemeIcon>
                <Box flex={1} miw={0}>
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Text fz="xs" fw={500} truncate title={model}>
                            {title}
                        </Text>
                        {status ? (
                            <Text fz="xs" c="dimmed" flex="none">
                                {status}
                            </Text>
                        ) : null}
                    </Group>
                    {subtitle ? (
                        <Text fz="xs" c="dimmed" truncate>
                            {subtitle}
                        </Text>
                    ) : null}
                    {lines.map((line) => (
                        <Text
                            key={line}
                            fz="xs"
                            c="dimmed"
                            truncate
                            title={line}
                        >
                            {line}
                        </Text>
                    ))}
                </Box>
            </Group>
            {actions ? (
                <Group
                    className={`${classes.reveal} ${classes.actions}`}
                    gap={2}
                    wrap="nowrap"
                >
                    {actions}
                </Group>
            ) : null}
            {diff ? <CodePeek diff={diff} /> : null}
        </Box>
    );
};

/** One thing about a proposal that did not go as asked, under the model it is about. */
const IssueRow: FC<{ issue: Issue }> = ({ issue: { kind, model, detail } }) => {
    const { icon, color, label } = ISSUE_KINDS[kind];
    return (
        <Box className={classes.section}>
            <Group
                className={classes.header}
                gap="xs"
                wrap="nowrap"
                align="flex-start"
            >
                <ThemeIcon variant="light" color={color} size={24} radius="sm">
                    <MantineIcon icon={icon} size={14} />
                </ThemeIcon>
                <Box flex={1} miw={0}>
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Text fz="xs" fw={500} truncate title={model}>
                            {model}
                        </Text>
                        <Text fz="xs" c="dimmed" flex="none">
                            {label}
                        </Text>
                    </Group>
                    <Text fz="xs" c="dimmed" className={classes.issueDetail}>
                        {detail}
                    </Text>
                </Box>
            </Group>
        </Box>
    );
};

const STATUS_LABELS = {
    applied: 'Published',
    undone: 'Undone',
    discarded: 'Discarded',
};

/** A change the agent proposed: what it touches, a peek at its code, and where it stands in the draft. */
export const SemanticLayerProposalCard: FC<{
    projectUuid: string;
    proposal: SemanticLayerProposal;
}> = ({ projectUuid, proposal }) => {
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const discard = useDiscardDraftChange(projectUuid);
    const refresh = useRefreshSemanticLayerDraft(projectUuid);
    const { draftChangeUuid } = proposal;
    const inDraft = draft?.changes.some(
        (change) => change.draftChangeUuid === draftChangeUuid,
    );
    const settledChange = draft?.settled.find(
        (change) => change.draftChangeUuid === draftChangeUuid,
    );
    const settled = settledChange?.status;
    const pullRequestUrl = settledChange?.pullRequestUrl ?? null;
    // The agent adds to the draft on the server, so a new card means it moved.
    const isUnknown = !!draftChangeUuid && !!draft && !inDraft && !settled;
    useEffect(() => {
        if (isUnknown) void refresh();
    }, [isUnknown, refresh]);
    // A model the proposal changes nothing on has no section of its own; what was left out says why.
    const passed = proposal.models.filter(({ status }) => status === 'ready');
    const issues = listProposalIssues(proposal);
    const settledLabel =
        settled && (pullRequestUrl ? 'Pull request' : STATUS_LABELS[settled]);
    const status = settledLabel ? settledLabel : inDraft ? 'Draft' : null;
    const getActions = (model: string) => {
        if (inDraft && draftChangeUuid) {
            return (
                <ConfirmDeleteButton
                    size="sm"
                    aria-label="Discard this change"
                    tooltip="Click again to discard this change"
                    disabled={discard.isLoading}
                    onConfirm={() => discard.mutate(draftChangeUuid)}
                >
                    <MantineIcon icon={IconTrash} />
                </ConfirmDeleteButton>
            );
        }
        if (settled !== 'applied') return null;
        if (pullRequestUrl) {
            return (
                <Tooltip label="View pull request">
                    <ActionIcon
                        size="sm"
                        aria-label="View pull request"
                        component="a"
                        href={pullRequestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <MantineIcon icon={IconGitPullRequest} />
                    </ActionIcon>
                </Tooltip>
            );
        }
        return (
            <Tooltip label="Open model">
                <ActionIcon
                    size="sm"
                    aria-label="Open model"
                    component={Link}
                    to={getSemanticStudioUrl(projectUuid, {
                        ref: { type: 'explore', exploreId: model },
                    })}
                >
                    <MantineIcon icon={IconArrowUpRight} />
                </ActionIcon>
            </Tooltip>
        );
    };
    return (
        <Paper
            mt="xs"
            className={classes.card}
            data-settled={settled === 'undone' || settled === 'discarded'}
        >
            {passed.map(({ model, changes }, index) => (
                <ModelSection
                    key={model}
                    model={model}
                    changes={changes}
                    diff={proposal.diffs.find((diff) => diff.model === model)}
                    status={index === 0 ? status : null}
                    actions={index === 0 ? getActions(model) : null}
                />
            ))}
            {issues.map((issue) => (
                <IssueRow
                    key={`${issue.kind}|${issue.model}|${issue.detail}`}
                    issue={issue}
                />
            ))}
            {inDraft ? (
                <Group
                    className={`${classes.section} ${classes.progress}`}
                    gap="sm"
                    justify="space-between"
                    wrap="wrap"
                >
                    <Group gap="sm" wrap="wrap">
                        <Task state="done" label="In your draft" />
                        <Task state="todo" label="Review" />
                        <Task state="todo" label="Publish" />
                    </Group>
                    <Button
                        size="compact-xs"
                        variant="default"
                        component={Link}
                        to={`${getSemanticStudioUrl(projectUuid, { ref: null })}?${DRAFT_PARAM}=${DRAFT_REVIEW}`}
                    >
                        View changes
                    </Button>
                </Group>
            ) : null}
        </Paper>
    );
};
