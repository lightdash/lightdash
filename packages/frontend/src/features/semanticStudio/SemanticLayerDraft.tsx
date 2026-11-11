/** The person's draft of the semantic layer: its review page, and the check before it goes live. */
import { type SemanticLayerDraft } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    Tooltip,
} from '@mantine/core';
import { WorkerPoolContextProvider } from '@pierre/diffs/react';
import {
    IconExternalLink,
    IconEye,
    IconEyeOff,
    IconTable,
} from '@tabler/icons-react';
import { countBy, uniqBy } from 'es-toolkit/compat';
import { useEffect, useRef, useState, type FC } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import useToaster from '../../hooks/toaster/useToaster';
import { ChangeDiff } from './ChangeDiff';
import { DevelopmentBar } from './DevelopmentBar';
import { useDevelopmentView } from './developmentView';
import {
    ChangeQueue,
    DraftUsage,
    MetricComparison,
    ModelNotices,
    PublishChecklist,
} from './DraftInsights';
import {
    CHANGE_KIND_LABELS,
    count,
    describeModelChange,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    refusalText,
    type ChangeKind,
} from './modelCode';
import classes from './SemanticLayerDraft.module.css';
import {
    useAppliesAsPullRequest,
    useApplySemanticLayerDraft,
    useCheckSemanticLayerDraftImpact,
    useDiscardSemanticLayerDraft,
    useSemanticLayerDraft,
    useSemanticLayerDraftImpact,
    useSemanticLayerDraftUsage,
} from './useSemanticLayerModel';

const KIND_NOUNS: [ChangeKind, string][] = [
    ['new', 'new model'],
    ['changed', 'changed model'],
    ['removed', 'removed model'],
];

const summarizeDraftModels = ({ models }: SemanticLayerDraft) => {
    const totals = countBy(models, getChangeKind);
    return KIND_NOUNS.flatMap(([kind, noun]) =>
        totals[kind] ? [count(totals[kind], noun)] : [],
    ).join(', ');
};

/** Whether the draft, or one model of it, fails its checks. */
const cannotApply = (
    { changes, errors }: SemanticLayerDraft,
    model: string | null,
) => {
    const inScope = (name: string) => model === null || name === model;
    return (
        errors.some((error) => inScope(error.model)) ||
        changes.some((change) =>
            change.models.some(
                (entry) => inScope(entry.model) && entry.error !== null,
            ),
        )
    );
};

const MessageList: FC<{
    variant: 'warning' | 'danger';
    title: string;
    messages: string[];
}> = ({ variant, title, messages }) =>
    messages.length === 0 ? null : (
        <Callout variant={variant} title={title}>
            <Stack gap={4}>
                {[...new Set(messages)].map((message) => (
                    <Text key={message} fz="xs">
                        {message}
                    </Text>
                ))}
            </Stack>
        </Callout>
    );

/** What the background check found the draft, or one model of it, would break. */
const DraftImpact: FC<{ projectUuid: string; model: string | null }> = ({
    projectUuid,
    model,
}) => {
    const impact = useSemanticLayerDraftImpact(projectUuid, model);
    const check = useCheckSemanticLayerDraftImpact(projectUuid);
    if (impact.isInitialLoading || impact.data?.status === 'checking') {
        return (
            <Group gap="xs">
                <Loader size="xs" color="gray" />
                <Text fz="sm" c="dimmed">
                    Checking saved charts and dashboards
                </Text>
            </Group>
        );
    }
    if (impact.isError || (impact.data && impact.data.status !== 'done')) {
        return (
            <Callout
                variant="warning"
                title={
                    impact.data?.status === 'unchecked'
                        ? 'Saved charts and dashboards not checked'
                        : 'Could not check saved charts and dashboards'
                }
            >
                <Button
                    size="xs"
                    variant="default"
                    loading={check.isLoading}
                    onClick={() => check.mutate(undefined)}
                >
                    Check now
                </Button>
            </Callout>
        );
    }
    const breaks = uniqBy(
        impact.data?.breaks ?? [],
        ({ name, error }) => `${name}|${error}`,
    );
    if (breaks.length === 0) return null;
    return (
        <Callout
            variant="warning"
            title={`This breaks ${breaks.length === 1 ? '1 saved chart or dashboard' : `${breaks.length} saved charts or dashboards`}`}
        >
            <Stack gap={4}>
                {breaks.map(({ name, error, chartUuid, dashboardUuid }) => {
                    const path = chartUuid
                        ? `saved/${chartUuid}`
                        : dashboardUuid && `dashboards/${dashboardUuid}`;
                    return (
                        <Text key={`${name}|${error}`} fz="xs">
                            {path ? (
                                <Anchor
                                    href={`/projects/${projectUuid}/${path}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {name}
                                </Anchor>
                            ) : (
                                name
                            )}
                            : {error}
                        </Text>
                    );
                })}
            </Stack>
        </Callout>
    );
};

const ApplyModal: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    model: string | null;
    onClose: () => void;
}> = ({ projectUuid, draft, model, onClose }) => {
    const impact = useSemanticLayerDraftImpact(projectUuid, model);
    const usage = useSemanticLayerDraftUsage(projectUuid);
    const apply = useApplySemanticLayerDraft(projectUuid);
    const asPullRequest = useAppliesAsPullRequest(projectUuid);
    const { showToastSuccess } = useToaster();
    const models = model ?? draft.models.map((m) => m.model).join(', ');
    const confirmLabel = asPullRequest ? 'Open pull request' : 'Publish';
    // Applying never waits for the check: an unchecked draft is applied knowingly, like one that breaks something.
    const isRisky =
        impact.data?.status !== 'done' || impact.data.breaks.length > 0;
    return (
        <MantineModal
            opened
            onClose={onClose}
            title={model === null ? 'Publish your changes' : `Publish ${model}`}
            confirmLabel={isRisky ? `${confirmLabel} anyway` : confirmLabel}
            confirmLoading={apply.isLoading}
            confirmDisabled={draft.models.some(
                (entry) =>
                    (model === null || entry.model === model) &&
                    entry.reconciliation?.state === 'conflict',
            )}
            onConfirm={() =>
                apply.mutate(model, {
                    onSuccess: ({ failures, pullRequestUrl }) => {
                        if (failures.length > 0) return;
                        if (pullRequestUrl) {
                            showToastSuccess({
                                title: 'Pull request opened',
                                action: {
                                    children: 'View pull request',
                                    icon: IconExternalLink,
                                    onClick: () =>
                                        window.open(
                                            pullRequestUrl,
                                            '_blank',
                                            'noopener',
                                        ),
                                },
                            });
                        }
                        onClose();
                    },
                })
            }
        >
            <Stack gap="sm">
                <Text fz="sm">
                    {asPullRequest
                        ? `Your changes to ${models} go to the project's repository as a pull request. They go live once it merges and the project refreshes.`
                        : `Your changes to ${models} go live for everyone on this project. Undo is on each model's History tab.`}
                </Text>
                <PublishChecklist
                    draft={draft}
                    model={model}
                    breaks={
                        impact.data?.status === 'done'
                            ? impact.data.breaks.length
                            : null
                    }
                    chartsThatChange={
                        usage.data
                            ? new Set(
                                  usage.data.fields
                                      .filter(
                                          (field) =>
                                              model === null ||
                                              field.model === model,
                                      )
                                      .flatMap(({ charts }) =>
                                          charts.map(({ uuid }) => uuid),
                                      ),
                              ).size
                            : null
                    }
                />
                <DraftImpact projectUuid={projectUuid} model={model} />
                <MessageList
                    variant="danger"
                    title="Nothing was published"
                    messages={(apply.data?.failures ?? []).map(
                        (failure) => `${failure.model}: ${failure.error}`,
                    )}
                />
            </Stack>
        </MantineModal>
    );
};

const DiscardButton: FC<{
    label: string;
    disabled: boolean;
    onConfirm: () => void;
}> = ({ label, disabled, onConfirm }) => {
    const [armed, setArmed] = useState(false);
    return (
        <Button
            size="xs"
            variant={armed ? 'light' : 'subtle'}
            color={armed ? 'red' : undefined}
            disabled={disabled}
            onMouseLeave={() => setArmed(false)}
            onBlur={() => setArmed(false)}
            onClick={() => {
                setArmed(!armed);
                if (armed) onConfirm();
            }}
        >
            {armed ? 'Confirm discard' : label}
        </Button>
    );
};

/** Discard and apply, for the whole draft when `model` is null. */
const DraftActions: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    model: string | null;
}> = ({ projectUuid, draft, model }) => {
    const discard = useDiscardSemanticLayerDraft(projectUuid);
    const [applying, setApplying] = useState(false);
    const isAll = model === null && draft.models.length > 1;
    const blocked = cannotApply(draft, model);
    const hasModels = draft.models.length > 0;
    const discardLabel = isAll ? 'Discard all' : 'Discard';
    return (
        <Group gap="xs" wrap="nowrap" flex="none">
            <DiscardButton
                label={hasModels ? discardLabel : 'Clear draft'}
                disabled={discard.isLoading}
                onConfirm={() => discard.mutate(model)}
            />
            {hasModels ? (
                <Tooltip
                    label="Some changes no longer pass their checks."
                    disabled={!blocked}
                >
                    <Button
                        size="xs"
                        variant={model === null ? 'filled' : 'default'}
                        data-disabled={blocked || undefined}
                        onClick={() => {
                            if (!blocked) setApplying(true);
                        }}
                    >
                        {isAll ? 'Publish all' : 'Publish'}
                    </Button>
                </Tooltip>
            ) : null}
            {applying ? (
                <ApplyModal
                    projectUuid={projectUuid}
                    draft={draft}
                    model={model}
                    onClose={() => setApplying(false)}
                />
            ) : null}
        </Group>
    );
};

/** Switches the person's own queries between the live models and their changes in development. */
const PreviewToggle: FC<{
    isPreviewing: boolean;
    onChange: (next: boolean) => void;
}> = ({ isPreviewing, onChange }) => (
    <Tooltip label="Explore and your charts read your changes. Only you see them.">
        <Button
            size="xs"
            variant="default"
            leftSection={
                <MantineIcon
                    icon={isPreviewing ? IconEyeOff : IconEye}
                    size={14}
                />
            }
            onClick={() => onChange(!isPreviewing)}
        >
            {isPreviewing ? 'Back to live' : 'Try my changes'}
        </Button>
    </Tooltip>
);

/** Says so once when someone publishes to a model this person has in development, since the page does not reload for it. */
const usePublishedUnderNotice = (draft: SemanticLayerDraft | undefined) => {
    const { showToastInfo } = useToaster();
    // Null until the first read, which is not news: it was already so when the page opened.
    const seen = useRef<Set<string> | null>(null);
    useEffect(() => {
        if (!draft) return;
        const current = draft.models.flatMap(({ model, publishedSince }) =>
            publishedSince
                ? [
                      {
                          key: `${model}@${new Date(publishedSince.at).getTime()}`,
                          model,
                          by: publishedSince.by,
                      },
                  ]
                : [],
        );
        const known = seen.current;
        seen.current = new Set(current.map(({ key }) => key));
        if (known === null) return;
        current
            .filter(({ key }) => !known.has(key))
            .forEach(({ model, by }) =>
                showToastInfo({
                    title: `${by ?? 'Someone'} published a change to ${model}`,
                    subtitle:
                        'Your changes in development are now shown on top of it.',
                }),
            );
    }, [draft, showToastInfo]);
};

/** A draft in the toolbar: what it changes, the way to its review and back, and publishing it. */
export const DraftDevelopmentBar: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const [searchParams, setSearchParams] = useSearchParams();
    const [publishing, setPublishing] = useState(false);
    const [isPreviewing, setIsPreviewing] = useDevelopmentView();
    const discard = useDiscardSemanticLayerDraft(projectUuid);
    const isEmpty = !draft || draft.changes.length === 0;
    usePublishedUnderNotice(draft);
    // Once nothing is in development there is nothing to preview.
    useEffect(() => {
        if (draft && isEmpty && isPreviewing) setIsPreviewing(false);
    }, [draft, isEmpty, isPreviewing, setIsPreviewing]);
    if (isEmpty) return null;
    const reviewing = searchParams.get(DRAFT_PARAM) === DRAFT_REVIEW;
    const blocked = cannotApply(draft, null);
    return (
        <DevelopmentBar
            summary={
                <Text fz="xs" c="dimmed" truncate>
                    {draft.models.length > 0
                        ? summarizeDraftModels(draft)
                        : 'Nothing new to publish'}
                </Text>
            }
        >
            {reviewing ? (
                <DiscardButton
                    label={draft.models.length > 1 ? 'Discard all' : 'Discard'}
                    disabled={discard.isLoading}
                    onConfirm={() => discard.mutate(null)}
                />
            ) : null}
            <PreviewToggle
                isPreviewing={isPreviewing}
                onChange={setIsPreviewing}
            />
            <Button
                size="xs"
                variant="default"
                onClick={() =>
                    setSearchParams(
                        reviewing ? {} : { [DRAFT_PARAM]: DRAFT_REVIEW },
                    )
                }
            >
                {reviewing ? 'Close review' : 'Review'}
            </Button>
            {draft.models.length > 0 ? (
                <Tooltip
                    label="Some changes no longer pass their checks."
                    disabled={!blocked}
                >
                    <Button
                        size="xs"
                        data-disabled={blocked || undefined}
                        onClick={() => {
                            if (!blocked) setPublishing(true);
                        }}
                    >
                        Publish
                    </Button>
                </Tooltip>
            ) : null}
            {publishing ? (
                <ApplyModal
                    projectUuid={projectUuid}
                    draft={draft}
                    model={null}
                    onClose={() => setPublishing(false)}
                />
            ) : null}
        </DevelopmentBar>
    );
};

/** What the draft left out, could not do, or did not need to do. */
const DraftNotes: FC<{ draft: SemanticLayerDraft }> = ({ draft }) => {
    const notes = draft.changes
        .flatMap((change) => change.models)
        .flatMap(({ model, changes, refusals, error }) => [
            ...refusals.map((refusal) => ({
                text: refusalText(model, refusal),
                color: 'dimmed',
            })),
            ...(error ? [{ text: `${model}: ${error}`, color: 'red' }] : []),
            ...(!error && changes.length === 0
                ? [{ text: `${model} already has this.`, color: 'dimmed' }]
                : []),
        ]);
    if (notes.length === 0) return null;
    return (
        <Stack gap={2}>
            {uniqBy(notes, 'text').map(({ text, color }) => (
                <Text key={text} fz="xs" c={color}>
                    {text}
                </Text>
            ))}
        </Stack>
    );
};

type DraftProps = { projectUuid: string; draft: SemanticLayerDraft };

type DraftReviewProps = DraftProps & {
    /** Hands a request to the agent beside the review. */
    onAskAgent: (prompt: string) => void;
};

export const DraftReviewHeading: FC<DraftProps> = ({ projectUuid, draft }) => {
    const [isPreviewing, setIsPreviewing] = useDevelopmentView();
    return (
        <Group className={classes.heading} gap="xs" wrap="nowrap">
            <Badge color="orange" flex="none">
                In development
            </Badge>
            <Text fz="sm" fw={500} truncate flex={1}>
                {draft.models.length > 0
                    ? summarizeDraftModels(draft)
                    : 'Already live, nothing to publish'}
            </Text>
            {draft.models.length > 0 ? (
                <PreviewToggle
                    isPreviewing={isPreviewing}
                    onChange={setIsPreviewing}
                />
            ) : null}
            <DraftActions
                projectUuid={projectUuid}
                draft={draft}
                model={null}
            />
        </Group>
    );
};

export const DraftReview: FC<DraftReviewProps> = ({
    projectUuid,
    draft,
    onAskAgent,
}) => {
    // Applying or discarding the last change leaves nothing to review.
    if (draft.changes.length === 0) {
        return <Navigate to={{ search: '' }} replace />;
    }
    return (
        <Stack gap="md" className={classes.review}>
            <MessageList
                variant="danger"
                title="This cannot be applied yet"
                messages={draft.errors.map(
                    ({ model, message }) => `${model}: ${message}`,
                )}
            />
            <DraftImpact projectUuid={projectUuid} model={null} />
            <DraftNotes draft={draft} />
            <DraftUsage projectUuid={projectUuid} />
            <ChangeQueue
                projectUuid={projectUuid}
                draft={draft}
                onAskAgent={onAskAgent}
            />
            <WorkerPoolContextProvider
                poolOptions={PIERRE_POOL_OPTIONS}
                highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
            >
                {draft.models.map((modelChange) => {
                    const { title, subtitle } = describeModelChange(
                        modelChange.model,
                        modelChange,
                    );
                    return (
                        <Paper
                            key={modelChange.model}
                            className={classes.model}
                        >
                            <Group
                                className={classes.modelHead}
                                gap="xs"
                                wrap="nowrap"
                            >
                                <ThemeIcon
                                    variant="light"
                                    color="indigo"
                                    size={24}
                                    radius="sm"
                                >
                                    <MantineIcon icon={IconTable} size={14} />
                                </ThemeIcon>
                                <Box miw={0} flex={1}>
                                    <Text fz="sm" fw={500} truncate>
                                        {title}
                                    </Text>
                                    <Text fz="xs" c="dimmed" truncate>
                                        {subtitle ??
                                            CHANGE_KIND_LABELS[
                                                getChangeKind(modelChange)
                                            ]}
                                    </Text>
                                </Box>
                                {draft.models.length > 1 ? (
                                    <DraftActions
                                        projectUuid={projectUuid}
                                        draft={draft}
                                        model={modelChange.model}
                                    />
                                ) : null}
                            </Group>
                            <ModelNotices
                                projectUuid={projectUuid}
                                model={modelChange}
                                onAskAgent={onAskAgent}
                            />
                            <ChangeDiff
                                modelName={modelChange.model}
                                change={modelChange}
                                variant="full"
                            />
                            <MetricComparison
                                projectUuid={projectUuid}
                                draft={draft}
                                model={modelChange}
                            />
                        </Paper>
                    );
                })}
            </WorkerPoolContextProvider>
        </Stack>
    );
};
