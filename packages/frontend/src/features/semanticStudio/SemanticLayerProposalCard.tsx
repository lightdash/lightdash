import {
    type ModelFragmentChange,
    type SemanticLayerProposal,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowsDiagonal,
    IconArrowsDiagonalMinimize2,
    IconArrowUpRight,
    IconTable,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { ChangeDiff } from './ChangeDiff';
import {
    describeModelChange,
    refusalText,
    summarizeModelChanges,
} from './modelCode';
import classes from './SemanticLayerProposalCard.module.css';
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
                    <MantineIcon icon={IconTable} size={14} />
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

const STATUS_LABELS = {
    applied: 'Applied',
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
    const settled = draft?.settled.find(
        (change) => change.draftChangeUuid === draftChangeUuid,
    )?.status;
    // The agent adds to the draft on the server, so a new card means it moved.
    const isUnknown = !!draftChangeUuid && !!draft && !inDraft && !settled;
    useEffect(() => {
        if (isUnknown) void refresh();
    }, [isUnknown, refresh]);
    const passed = proposal.models.filter(({ status }) => status !== 'failed');
    const failures = proposal.models.filter(
        ({ status }) => status === 'failed',
    );
    const refusals = proposal.models.flatMap(({ model, refusals: refused }) =>
        refused.map((refusal) => refusalText(model, refusal)),
    );
    const notes = proposal.models.flatMap(({ notes: noted }) => noted ?? []);
    const status = settled
        ? STATUS_LABELS[settled]
        : inDraft
          ? 'In draft'
          : null;
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
            {failures.length > 0 || refusals.length > 0 || notes.length > 0 ? (
                <Stack gap={2} p="xs">
                    {notes.map((text) => (
                        <Text key={text} fz="xs" c="orange">
                            {text}
                        </Text>
                    ))}
                    {failures.map(({ model, error }) => (
                        <Text key={model} fz="xs" c="red">
                            {model}: {error}
                        </Text>
                    ))}
                    {refusals.map((text) => (
                        <Text key={text} fz="xs" c="dimmed">
                            {text}
                        </Text>
                    ))}
                </Stack>
            ) : null}
        </Paper>
    );
};
