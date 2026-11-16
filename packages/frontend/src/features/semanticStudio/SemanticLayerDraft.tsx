/** The person's draft of the semantic layer: its review page, and the check before it goes live. */
import { type SemanticLayerDraft } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Menu,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    Tooltip,
} from '@mantine/core';
import { WorkerPoolContextProvider } from '@pierre/diffs/react';
import {
    IconAlertTriangle,
    IconDots,
    IconExternalLink,
    IconEye,
    IconGitPullRequest,
    IconTable,
    IconWorldUpload,
} from '@tabler/icons-react';
import { countBy, sortBy, uniqBy } from 'es-toolkit/compat';
import { useEffect, useRef, useState, type FC } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import { useFinishDiscardedWork } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
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
    PublishSummary,
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
} from './useSemanticLayerModel';
import { useTryInExplore } from './useTryInExplore';

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

/** How many models of the draft, or the one named, still have a part to choose between. */
const countConflicts = (
    { models }: SemanticLayerDraft,
    model: string | null,
): number =>
    models.filter(
        (entry) =>
            (model === null || entry.model === model) &&
            entry.reconciliation?.state === 'conflict',
    ).length;

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
            <Group gap="xs">
                <Text fz="xs" c="dimmed">
                    {impact.data?.status === 'unchecked'
                        ? 'Saved charts and dashboards have not been checked against these changes.'
                        : 'Saved charts and dashboards could not be checked.'}
                </Text>
                <Button
                    size="compact-xs"
                    variant="default"
                    loading={check.isLoading}
                    onClick={() => check.mutate(undefined)}
                >
                    Check now
                </Button>
            </Group>
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
    const apply = useApplySemanticLayerDraft(projectUuid);
    const asPullRequest = useAppliesAsPullRequest(projectUuid);
    const { showToastSuccess } = useToaster();
    const scoped = draft.models.filter(
        (entry) => model === null || entry.model === model,
    );
    const confirmLabel = asPullRequest ? 'Open pull request' : 'Publish';
    // Applying never waits for the check: an unchecked draft is applied knowingly, like one that breaks something.
    const isRisky =
        impact.data?.status !== 'done' || impact.data.breaks.length > 0;
    return (
        <MantineModal
            opened
            onClose={onClose}
            icon={asPullRequest ? IconGitPullRequest : IconWorldUpload}
            title={
                asPullRequest ? 'Open a pull request' : 'Publish to everyone'
            }
            subtitle={
                asPullRequest
                    ? `${scoped.length} ${scoped.length === 1 ? 'model goes' : 'models go'} to your repository. Nothing is live until it merges.`
                    : `${scoped.length} ${scoped.length === 1 ? 'model goes' : 'models go'} live for everyone on this project.`
            }
            confirmLabel={isRisky ? `${confirmLabel} anyway` : confirmLabel}
            confirmLoading={apply.isLoading}
            confirmDisabled={scoped.some(
                (entry) => entry.reconciliation?.state === 'conflict',
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
            <Stack gap="md">
                <PublishSummary
                    projectUuid={projectUuid}
                    draft={draft}
                    model={model}
                />
                <Stack gap={6}>
                    <Text fz="xs" fw={500} c="dimmed">
                        Checks
                    </Text>
                    <PublishChecklist
                        draft={draft}
                        model={model}
                        breaks={
                            impact.data?.status === 'done'
                                ? impact.data.breaks.length
                                : null
                        }
                    />
                </Stack>
                {asPullRequest ? null : (
                    <Text fz="xs" c="dimmed">
                        You can undo this from each model's History tab.
                    </Text>
                )}
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
    const asPullRequest = useAppliesAsPullRequest(projectUuid);
    const [applying, setApplying] = useState(false);
    const isAll = model === null && draft.models.length > 1;
    const hasConflict = countConflicts(draft, model) > 0;
    const blocked = hasConflict || cannotApply(draft, model);
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
                    label={
                        hasConflict
                            ? 'Choose which version to keep first.'
                            : 'Some changes no longer pass their checks.'
                    }
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
                        {asPullRequest
                            ? 'Open pull request'
                            : isAll
                              ? 'Publish all'
                              : 'Publish'}
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

/** Switches what the person's own queries read: the live models, or those with their changes on top. */
export const ChangesSwitch: FC<{
    isOnMyChanges: boolean;
    onChange: (next: boolean) => void;
    /** Why it cannot be switched right now; shown disabled with this as its tooltip. */
    unavailableReason?: string;
}> = ({ isOnMyChanges, onChange, unavailableReason }) => (
    <Tooltip
        multiline
        w={240}
        label={
            unavailableReason ??
            (isOnMyChanges
                ? 'Explore, charts and dashboards are reading your changes. Only you see this. Click to go back to live.'
                : 'Try your changes in Explore, charts and dashboards. Only you see it.')
        }
    >
        <Button
            size="xs"
            flex="none"
            variant={isOnMyChanges ? 'light' : 'default'}
            color={isOnMyChanges ? 'orange' : undefined}
            aria-pressed={isOnMyChanges}
            data-disabled={unavailableReason !== undefined || undefined}
            aria-disabled={unavailableReason !== undefined}
            onClick={() => {
                if (unavailableReason === undefined) onChange(!isOnMyChanges);
            }}
        >
            {isOnMyChanges ? 'Viewing my changes' : 'Try my changes'}
        </Button>
    </Tooltip>
);

/** Says so once when someone publishes to a model this person has in development, since the page does not reload for it. */
const usePublishedUnderNotice = (draft: SemanticLayerDraft | undefined) => {
    const { showToastInfo, showToastWarning } = useToaster();
    const [, setSearchParams] = useSearchParams();
    // Null until the first read, which is not news: it was already so when the page opened.
    const seen = useRef<Set<string> | null>(null);
    useEffect(() => {
        if (!draft) return;
        const current = draft.models.flatMap(
            ({ model, publishedSince, reconciliation }) =>
                publishedSince
                    ? [
                          {
                              key: `${model}@${new Date(publishedSince.at).getTime()}`,
                              model,
                              by: publishedSince.by,
                              isConflict: reconciliation?.state === 'conflict',
                          },
                      ]
                    : [],
        );
        const known = seen.current;
        seen.current = new Set(current.map(({ key }) => key));
        if (known === null) return;
        current
            .filter(({ key }) => !known.has(key))
            .forEach(({ model, by, isConflict }) =>
                isConflict
                    ? showToastWarning({
                          title: `${by ?? 'Someone'} changed a part of ${model} that you changed too`,
                          subtitle:
                              'Choose which version to keep before you publish.',
                          action: {
                              children: 'See both',
                              icon: IconEye,
                              onClick: () =>
                                  setSearchParams({
                                      [DRAFT_PARAM]: DRAFT_REVIEW,
                                  }),
                          },
                      })
                    : showToastInfo({
                          title: `${by ?? 'Someone'} published a change to ${model}`,
                          subtitle:
                              'It is outside what you changed, and your changes sit on top of it.',
                      }),
            );
    }, [draft, showToastInfo, showToastWarning, setSearchParams]);
};

/** A draft in the toolbar: what it changes, the way to its review and back, and publishing it. */
export const DraftDevelopmentBar: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const [searchParams, setSearchParams] = useSearchParams();
    const [publishing, setPublishing] = useState(false);
    const [discarding, setDiscarding] = useState(false);
    const [isPreviewing, setIsPreviewing] = useDevelopmentView();
    const tryInExplore = useTryInExplore(projectUuid);
    const discard = useDiscardSemanticLayerDraft(projectUuid);
    const asPullRequest = useAppliesAsPullRequest(projectUuid);
    const finishDiscardedWork = useFinishDiscardedWork(projectUuid);
    const impact = useSemanticLayerDraftImpact(projectUuid, null);
    const check = useCheckSemanticLayerDraftImpact(projectUuid);
    const isEmpty = !draft || draft.changes.length === 0;
    usePublishedUnderNotice(draft);
    // Once nothing is in development there is nothing to preview.
    useEffect(() => {
        if (draft && isEmpty && isPreviewing) setIsPreviewing(false);
    }, [draft, isEmpty, isPreviewing, setIsPreviewing]);
    if (isEmpty) return null;
    const reviewing = searchParams.get(DRAFT_PARAM) === DRAFT_REVIEW;
    const blocked = cannotApply(draft, null);
    const conflicts = countConflicts(draft, null);
    // A removed model has nothing to open.
    const tryModel =
        draft.models.find((entry) => getChangeKind(entry) !== 'removed')
            ?.model ?? null;
    return (
        <DevelopmentBar
            summary={
                draft.models.length > 0 ? null : (
                    <Text fz="xs" c="dimmed" truncate>
                        Nothing new to publish
                    </Text>
                )
            }
        >
            {isPreviewing ? null : (
                <ChangesSwitch
                    isOnMyChanges={false}
                    onChange={setIsPreviewing}
                />
            )}
            {conflicts > 0 ? (
                <Tooltip label="Someone published to a part you changed too. Choose which version to keep, then publish.">
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={
                            <MantineIcon
                                icon={IconAlertTriangle}
                                size={14}
                                color="yellow"
                            />
                        }
                        onClick={() => {
                            if (!reviewing) {
                                setSearchParams({
                                    [DRAFT_PARAM]: DRAFT_REVIEW,
                                });
                                return;
                            }
                            document
                                .querySelector('[data-conflict]')
                                ?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center',
                                });
                        }}
                    >
                        Resolve {count(conflicts, 'conflict')}
                    </Button>
                </Tooltip>
            ) : draft.models.length > 0 ? (
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
                        {asPullRequest ? 'Open pull request' : 'Publish'}
                    </Button>
                </Tooltip>
            ) : null}
            <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                    <ActionIcon
                        size="md"
                        aria-label="More actions"
                        variant="default"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    {tryModel ? (
                        <Menu.Item onClick={() => tryInExplore(tryModel, null)}>
                            Try in Explore
                        </Menu.Item>
                    ) : null}
                    <Menu.Item
                        disabled={
                            check.isLoading ||
                            impact.data?.status === 'checking'
                        }
                        onClick={() => {
                            check.mutate(undefined);
                            setSearchParams({ [DRAFT_PARAM]: DRAFT_REVIEW });
                        }}
                    >
                        Check saved charts and dashboards
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" onClick={() => setDiscarding(true)}>
                        Discard draft
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {discarding ? (
                <MantineModal
                    opened
                    variant="delete"
                    title="Discard draft"
                    description={`${count(draft.changes.length, 'change')} in development will be removed. Nothing live changes, and this cannot be undone.`}
                    confirmLabel="Discard"
                    confirmLoading={discard.isLoading}
                    onClose={() => setDiscarding(false)}
                    onConfirm={() =>
                        discard.mutate(null, {
                            onSuccess: () => {
                                setDiscarding(false);
                                finishDiscardedWork();
                            },
                        })
                    }
                />
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
                Draft
            </Badge>
            <Text fz="sm" fw={500} truncate flex={1}>
                {draft.models.length > 0
                    ? summarizeDraftModels(draft)
                    : 'Already live, nothing to publish'}
            </Text>
            {draft.models.length > 0 ? (
                <ChangesSwitch
                    isOnMyChanges={isPreviewing}
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
    const impact = useSemanticLayerDraftImpact(projectUuid, null);
    // A check that is running or found something is worth reading; one not yet run is asked for from the menu.
    const showsImpact =
        impact.data?.status === 'checking' ||
        (impact.data?.status === 'done' && impact.data.breaks.length > 0);
    // Applying or discarding the last change leaves nothing to review.
    if (draft.changes.length === 0) {
        return <Navigate to={{ search: '' }} replace />;
    }
    // A model with a choice still to make comes first: nothing publishes until it is made.
    const models = sortBy(draft.models, ({ reconciliation }) =>
        reconciliation?.state === 'conflict' ? 0 : 1,
    );
    return (
        <Stack gap="md" className={classes.review}>
            <MessageList
                variant="danger"
                title="This cannot be applied yet"
                messages={draft.errors.map(
                    ({ model, message }) => `${model}: ${message}`,
                )}
            />
            {showsImpact ? (
                <DraftImpact projectUuid={projectUuid} model={null} />
            ) : null}
            <DraftNotes draft={draft} />
            <WorkerPoolContextProvider
                poolOptions={PIERRE_POOL_OPTIONS}
                highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
            >
                {models.map((modelChange) => {
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
                                    <Text
                                        component="h3"
                                        fz="sm"
                                        fw={500}
                                        truncate
                                    >
                                        {title}
                                    </Text>
                                    <Text fz="xs" c="dimmed" truncate>
                                        {subtitle ??
                                            CHANGE_KIND_LABELS[
                                                getChangeKind(modelChange)
                                            ]}
                                    </Text>
                                </Box>
                                {modelChange.reconciliation?.state ===
                                'conflict' ? (
                                    <Badge color="yellow" flex="none">
                                        {count(
                                            modelChange.reconciliation.conflicts
                                                .length,
                                            'conflict',
                                        )}
                                    </Badge>
                                ) : null}
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
                            />
                            {/* Until the choice is made the diff would only repeat both versions. */}
                            {modelChange.reconciliation?.state ===
                            'conflict' ? (
                                <Text fz="xs" c="dimmed" p="sm">
                                    The code shows once you choose which version
                                    to keep.
                                </Text>
                            ) : (
                                <ChangeDiff
                                    modelName={modelChange.model}
                                    change={modelChange}
                                    variant="full"
                                />
                            )}
                            <MetricComparison
                                projectUuid={projectUuid}
                                draft={draft}
                                model={modelChange}
                            />
                        </Paper>
                    );
                })}
            </WorkerPoolContextProvider>
            <DraftUsage projectUuid={projectUuid} />
            <ChangeQueue
                projectUuid={projectUuid}
                draft={draft}
                onAskAgent={onAskAgent}
            />
        </Stack>
    );
};
