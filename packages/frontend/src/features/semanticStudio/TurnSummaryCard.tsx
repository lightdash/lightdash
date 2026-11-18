import {
    assertUnreachable,
    type SemanticLayerDraft,
    type SemanticLayerDraftImpact,
    type SemanticLayerProposal,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    Text,
    UnstyledButton,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconCircleCheck,
    IconCircleMinus,
    IconGitBranch,
    IconGitPullRequest,
    IconTable,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { Link } from 'react-router';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { TryIt } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/TryItButton';
import { cannotApply } from './draftState';
import {
    describeModelChange,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    getModelCodeSearch,
    listFieldChanges,
    type ChangeKind,
    type FieldChange,
} from './modelCode';
import { ISSUE_KINDS, listProposalIssues } from './proposalIssues';
import { ApplyModal } from './SemanticLayerDraft';
import { Task, TaskIcon, type TaskState } from './TaskRow';
import classes from './TurnSummaryCard.module.css';
import { getSemanticStudioUrl } from './urls';
import {
    useDiscardDraftChange,
    usePublishMode,
    useRefreshSemanticLayerDraft,
    useSemanticLayerDraft,
    useSemanticLayerDraftImpact,
} from './useSemanticLayerModel';

const GLYPHS: Record<ChangeKind, { glyph: string; word: string }> = {
    new: { glyph: '+', word: 'Added' },
    changed: { glyph: '~', word: 'Changed' },
    removed: { glyph: '−', word: 'Removed' },
};

const KIND_LABELS: Record<FieldChange['kind'], string> = {
    dimension: 'Dimension',
    metric: 'Metric',
    join: 'Join',
    model: 'Model',
};

type ModelGroup = {
    model: string;
    title: string;
    subtitle: string | null;
    removed: boolean;
    fields: FieldChange[];
};

/** Every model the turn touched, with its fields; a part changed in two proposals reads once. */
const groupByModel = (proposals: SemanticLayerProposal[]): ModelGroup[] => {
    const models = [
        ...new Set(proposals.flatMap((p) => p.models.map((m) => m.model))),
    ];
    return models.map((model) => {
        const diffs = proposals.flatMap(({ diffs: all }) =>
            all.filter((diff) => diff.model === model),
        );
        const fields = new Map<string, FieldChange>();
        proposals.forEach(({ models: entries, diffs: all }) => {
            const entry = entries.find((m) => m.model === model);
            const diff = all.find((d) => d.model === model);
            if (!entry || entry.status !== 'ready' || !diff) return;
            listFieldChanges(model, entry.changes, diff).forEach((field) => {
                const id = `${field.kind}:${field.name}`;
                const earlier = fields.get(id);
                fields.set(id, {
                    ...field,
                    change:
                        earlier?.change === 'new' && field.change !== 'removed'
                            ? 'new'
                            : field.change,
                });
            });
        });
        const span =
            diffs.length > 0
                ? {
                      contentBefore: diffs[0].contentBefore,
                      contentAfter: diffs[diffs.length - 1].contentAfter,
                  }
                : null;
        return {
            model,
            ...describeModelChange(model, span),
            removed: span !== null && getChangeKind(span) === 'removed',
            fields: [...fields.values()],
        };
    });
};

type Phase =
    | { kind: 'draft'; error: string | null }
    | { kind: 'published'; model: string | null }
    | { kind: 'pull_request'; url: string }
    | { kind: 'gone'; label: string }
    | { kind: 'loading' }
    | { kind: 'none' };

const getPhase = (
    draft: SemanticLayerDraft | undefined,
    uuids: string[],
    groups: ModelGroup[],
): Phase => {
    if (uuids.length === 0) return { kind: 'none' };
    if (!draft) return { kind: 'loading' };
    const inDraft = draft.changes.filter((c) =>
        uuids.includes(c.draftChangeUuid),
    );
    if (inDraft.length > 0) {
        const models = groups.map(({ model }) => model);
        const error =
            inDraft
                .flatMap((change) => change.models)
                .find((entry) => entry.error !== null)?.error ??
            draft.errors.find((entry) => models.includes(entry.model))
                ?.message ??
            null;
        return { kind: 'draft', error };
    }
    const settled = draft.settled.filter((s) =>
        uuids.includes(s.draftChangeUuid),
    );
    const applied = settled.find(({ status }) => status === 'applied');
    if (applied?.pullRequestUrl) {
        return { kind: 'pull_request', url: applied.pullRequestUrl };
    }
    if (applied) {
        const open = groups.find(({ removed }) => !removed)?.model;
        return { kind: 'published', model: open ?? null };
    }
    // Not in the draft as read yet: the agent added it after the last read.
    if (settled.length === 0) return { kind: 'loading' };
    return {
        kind: 'gone',
        label: settled.every(({ status }) => status === 'undone')
            ? 'Undone'
            : 'Discarded',
    };
};

type Safety = { state: TaskState; text: string; why: string | null };

/** Whether the draft is safe to try, in one line with its reason. */
const getSafety = (
    error: string | null,
    impact: SemanticLayerDraftImpact | undefined,
): Safety => {
    if (error) return { state: 'failed', text: "Doesn't compile", why: error };
    if (!impact) {
        return { state: 'running', text: 'Checking saved charts', why: null };
    }
    switch (impact.status) {
        case 'checking':
            return {
                state: 'running',
                text: 'Checking saved charts',
                why: null,
            };
        case 'unchecked':
            return {
                state: 'todo',
                text: 'Compiles',
                why: 'saved charts not checked yet',
            };
        case 'failed':
            return {
                state: 'todo',
                text: 'Compiles',
                why: "couldn't check saved charts",
            };
        case 'done': {
            const breaks = impact.breaks.length;
            return breaks > 0
                ? {
                      state: 'failed',
                      text: `${breaks} saved ${breaks === 1 ? 'chart or dashboard stops' : 'charts or dashboards stop'} working`,
                      why: null,
                  }
                : {
                      state: 'done',
                      text: 'Safe to try',
                      why: 'compiles, no saved chart breaks',
                  };
        }
        default:
            return assertUnreachable(impact.status, 'Unknown impact status');
    }
};

const FieldRow: FC<{ to: string; field: FieldChange }> = ({ to, field }) => {
    const { glyph, word } = GLYPHS[field.change];
    return (
        <UnstyledButton
            component={Link}
            to={to}
            className={classes.row}
            data-change={field.change}
            title={field.name}
        >
            <Text span fz="xs" className={classes.glyph} aria-hidden>
                {glyph}
            </Text>
            <Text span fz="xs" c="dimmed">
                <VisuallyHidden>{word} </VisuallyHidden>
                {KIND_LABELS[field.kind]}
            </Text>
            <Text span fz="xs" truncate className={classes.label}>
                {field.label}
            </Text>
            {field.detail ? (
                <Text span fz="xs" c="dimmed" truncate className={classes.sub}>
                    {field.detail}
                </Text>
            ) : null}
        </UnstyledButton>
    );
};

/** The end of an agent turn in Studio: what changed in semantic terms, whether it is safe, and what to do next. */
export const TurnSummaryCard: FC<{
    projectUuid: string;
    proposals: SemanticLayerProposal[];
    /** Asks the agent in this chat; null while it is busy. */
    onAsk: ((message: string) => void) | null;
}> = ({ projectUuid, proposals, onAsk }) => {
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const { data: impact } = useSemanticLayerDraftImpact(projectUuid, null);
    const refresh = useRefreshSemanticLayerDraft(projectUuid);
    const discard = useDiscardDraftChange(projectUuid);
    const publishMode = usePublishMode(projectUuid);
    const [trial, setTrial] = useState<'idle' | 'trying' | 'tried'>('idle');
    const [publishing, setPublishing] = useState(false);
    const uuids = proposals.flatMap(({ draftChangeUuid }) =>
        draftChangeUuid ? [draftChangeUuid] : [],
    );
    const groups = groupByModel(proposals);
    const phase = getPhase(draft, uuids, groups);
    // The agent adds to the draft on the server, so a new card means it moved.
    const isUnknown =
        !!draft &&
        uuids.some(
            (uuid) =>
                !draft.changes.some((c) => c.draftChangeUuid === uuid) &&
                !draft.settled.some((s) => s.draftChangeUuid === uuid),
        );
    useEffect(() => {
        if (isUnknown) void refresh();
    }, [isUnknown, refresh]);

    const studioUrl = getSemanticStudioUrl(projectUuid, { ref: null });
    const reviewUrl = `${studioUrl}?${DRAFT_PARAM}=${DRAFT_REVIEW}`;
    const modelUrl = (model: string) =>
        getSemanticStudioUrl(projectUuid, {
            ref: { type: 'explore', exploreId: model },
        });
    const fieldUrl = (model: string, field: FieldChange) => {
        if (field.change === 'removed') return reviewUrl;
        if (field.kind === 'dimension' || field.kind === 'metric') {
            return `${modelUrl(model)}?${getModelCodeSearch(field.name)}`;
        }
        return modelUrl(model);
    };
    const issues = proposals.flatMap(listProposalIssues);
    const name =
        proposals.find(({ startedChange }) => startedChange)?.startedChange
            ?.name ??
        groups[0]?.title ??
        null;

    const isDraft = phase.kind === 'draft';
    const safety = isDraft ? getSafety(phase.error, impact) : null;
    const tryModels = draft
        ? draft.models
              .filter((entry) => getChangeKind(entry) !== 'removed')
              .map(({ model }) => model)
        : [];
    const publishLabel =
        publishMode === 'pull_request' ? 'Open pull request' : 'Publish';
    const blocked = !!draft && cannotApply(draft, null);

    const viewChanges = (primary: boolean) => (
        <Button
            key="view"
            size="compact-xs"
            variant={primary ? 'filled' : 'subtle'}
            component={Link}
            to={reviewUrl}
        >
            View changes
        </Button>
    );
    const tryIt = (primary: boolean) =>
        tryModels.length > 0 ? (
            <Button
                key="try"
                size="compact-xs"
                variant={primary ? 'filled' : 'subtle'}
                onClick={() => setTrial('trying')}
            >
                {trial === 'tried' ? 'Try again' : 'Try it'}
            </Button>
        ) : null;
    const actions = (() => {
        switch (phase.kind) {
            case 'draft':
                if (phase.error) {
                    return [
                        viewChanges(!onAsk),
                        onAsk ? (
                            <Button
                                key="fix"
                                size="compact-xs"
                                onClick={() =>
                                    onAsk(
                                        `The draft doesn't compile: ${phase.error}. Fix it.`,
                                    )
                                }
                            >
                                Fix with agent
                            </Button>
                        ) : null,
                    ];
                }
                if (safety?.state === 'running' || safety?.state === 'failed') {
                    return [tryIt(false), viewChanges(true)];
                }
                if (trial === 'tried' && !blocked) {
                    return [
                        viewChanges(false),
                        tryIt(false),
                        <Button
                            key="publish"
                            size="compact-xs"
                            onClick={() => setPublishing(true)}
                        >
                            {publishLabel}
                        </Button>,
                    ];
                }
                return [viewChanges(false), tryIt(true)];
            case 'published':
                return phase.model
                    ? [
                          <Button
                              key="open"
                              size="compact-xs"
                              component={Link}
                              to={modelUrl(phase.model)}
                          >
                              Open model
                          </Button>,
                      ]
                    : [];
            case 'pull_request':
                return [
                    <Button
                        key="pr"
                        size="compact-xs"
                        component="a"
                        href={phase.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        leftSection={
                            <MantineIcon icon={IconGitPullRequest} size={12} />
                        }
                    >
                        View pull request
                    </Button>,
                ];
            case 'gone':
            case 'loading':
            case 'none':
                return [];
            default:
                return assertUnreachable(phase, 'Unknown turn phase');
        }
    })();

    const steps = (() => {
        switch (phase.kind) {
            case 'draft':
                return [
                    <Task key="draft" state="done" label="In your draft" />,
                    <Task
                        key="try"
                        state={
                            phase.error
                                ? 'failed'
                                : trial === 'trying'
                                  ? 'running'
                                  : trial === 'tried'
                                    ? 'done'
                                    : 'todo'
                        }
                        label={trial === 'tried' ? 'Tried' : 'Try'}
                    />,
                    <Task key="publish" state="todo" label={publishLabel} />,
                ];
            case 'published':
                return [
                    <Task key="draft" state="done" label="In your draft" />,
                    <Task key="publish" state="done" label="Published" />,
                ];
            case 'pull_request':
                return [
                    <Task key="draft" state="done" label="In your draft" />,
                    <Task
                        key="publish"
                        state="done"
                        label="Pull request opened"
                    />,
                ];
            case 'gone':
            case 'loading':
            case 'none':
                return [];
            default:
                return assertUnreachable(phase, 'Unknown turn phase');
        }
    })();

    const header = (() => {
        switch (phase.kind) {
            case 'loading':
                return {
                    icon: <MantineIcon icon={IconGitBranch} size={14} />,
                    status: 'Draft',
                };
            case 'draft':
                return phase.error
                    ? {
                          icon: <TaskIcon state="failed" />,
                          status: "Draft doesn't compile",
                      }
                    : {
                          icon: <MantineIcon icon={IconGitBranch} size={14} />,
                          status: 'Draft',
                      };
            case 'published':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconCircleCheck}
                            size={14}
                            color="green"
                        />
                    ),
                    status: 'Published',
                };
            case 'pull_request':
                return {
                    icon: <MantineIcon icon={IconGitPullRequest} size={14} />,
                    status: 'Pull request',
                };
            case 'gone':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconCircleMinus}
                            size={14}
                            color="ldGray.5"
                        />
                    ),
                    status: phase.label,
                };
            case 'none':
                return {
                    icon: (
                        <MantineIcon
                            icon={IconAlertTriangle}
                            size={14}
                            color="yellow"
                        />
                    ),
                    status: 'Nothing changed',
                };
            default:
                return assertUnreachable(phase, 'Unknown turn phase');
        }
    })();

    return (
        <Paper
            mt="xs"
            className={classes.card}
            data-settled={
                phase.kind === 'published' ||
                phase.kind === 'pull_request' ||
                phase.kind === 'gone'
            }
            data-gone={phase.kind === 'gone'}
        >
            <Group className={classes.section} gap={6} wrap="nowrap">
                {header.icon}
                <Text fz="xs" fw={500} truncate flex={1}>
                    {header.status}
                    {name ? (
                        <Text span fz="xs" fw={400} c="dimmed">
                            {` · ${name}`}
                        </Text>
                    ) : null}
                </Text>
                {isDraft ? (
                    <ConfirmDeleteButton
                        size="sm"
                        aria-label="Discard these changes"
                        tooltip="Click again to discard these changes"
                        disabled={discard.isLoading}
                        onConfirm={() =>
                            uuids.forEach((uuid) => discard.mutate(uuid))
                        }
                    >
                        <MantineIcon icon={IconTrash} />
                    </ConfirmDeleteButton>
                ) : null}
            </Group>
            {groups.map(({ model, title, subtitle, fields }) => {
                const modelIssues = issues.filter((i) => i.model === model);
                if (
                    fields.length === 0 &&
                    modelIssues.length === 0 &&
                    !subtitle
                )
                    return null;
                return (
                    <Box key={model} className={classes.model}>
                        <Group
                            gap={4}
                            wrap="nowrap"
                            className={classes.modelName}
                        >
                            <MantineIcon
                                icon={IconTable}
                                size={12}
                                color="ldGray.5"
                            />
                            <Text fz="xs" c="dimmed" truncate title={model}>
                                {title}
                                {subtitle ? ` · ${subtitle}` : ''}
                            </Text>
                        </Group>
                        {fields.map((field) => (
                            <FieldRow
                                key={`${field.kind}:${field.name}`}
                                to={fieldUrl(model, field)}
                                field={field}
                            />
                        ))}
                        {modelIssues.map(({ kind, detail }) => (
                            <Group
                                key={`${kind}|${detail}`}
                                className={classes.issue}
                                gap={6}
                                wrap="nowrap"
                                align="flex-start"
                            >
                                <MantineIcon
                                    icon={ISSUE_KINDS[kind].icon}
                                    size={14}
                                    color={ISSUE_KINDS[kind].color}
                                />
                                <Text
                                    fz="xs"
                                    fw={500}
                                    flex={1}
                                    miw={0}
                                    className={classes.wrap}
                                >
                                    {ISSUE_KINDS[kind].label}
                                    <Text span fz="xs" fw={400} c="dimmed">
                                        {` · ${detail}`}
                                    </Text>
                                </Text>
                            </Group>
                        ))}
                    </Box>
                );
            })}
            {safety ? (
                <Group
                    className={classes.section}
                    gap={6}
                    wrap="nowrap"
                    align="flex-start"
                >
                    <Box className={classes.icon}>
                        <TaskIcon state={safety.state} />
                    </Box>
                    <Text fz="xs" flex={1} miw={0} className={classes.wrap}>
                        {safety.text}
                        {safety.why ? (
                            <Text span fz="xs" c="dimmed">
                                {` · ${safety.why}`}
                            </Text>
                        ) : null}
                    </Text>
                </Group>
            ) : null}
            {steps.length > 0 || actions.length > 0 ? (
                <Group
                    className={classes.section}
                    gap="xs"
                    justify="space-between"
                    wrap="wrap"
                >
                    <Group gap="sm" wrap="wrap" aria-live="polite">
                        {steps}
                    </Group>
                    <Group gap={4} wrap="nowrap" ml="auto">
                        {actions}
                    </Group>
                </Group>
            ) : null}
            {trial === 'trying' ? (
                <TryIt
                    projectUuid={projectUuid}
                    models={tryModels}
                    previewProjectUuid={null}
                    prUrl={null}
                    onClose={() => setTrial('tried')}
                />
            ) : null}
            {publishing && draft ? (
                <ApplyModal
                    projectUuid={projectUuid}
                    draft={draft}
                    model={null}
                    onClose={() => setPublishing(false)}
                />
            ) : null}
        </Paper>
    );
};
