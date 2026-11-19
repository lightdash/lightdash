/** The person's draft of the semantic layer: its review page, and the check before it goes live. */
import { type SemanticLayerDraft } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Code,
    Group,
    Loader,
    Menu,
    Stack,
    Text,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import { WorkerPoolContextProvider } from '@pierre/diffs/react';
import {
    IconAlertTriangle,
    IconDots,
    IconExternalLink,
    IconEye,
    IconFileCode,
    IconPlayerPlay,
} from '@tabler/icons-react';
import { sortBy, uniqBy } from 'es-toolkit/compat';
import { useEffect, useRef, useState, type FC } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import { TryIt } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/TryItButton';
import { useStudioAgent } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
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
import { cannotApply, describePublisher } from './draftState';
import { FieldChangeIcon } from './KindTypeIcon';
import {
    CHANGE_KIND_LABELS,
    count,
    countChangedLines,
    countPublishedChanges,
    describeModelChange,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    listPublishedParts,
    refusalText,
} from './modelCode';
import classes from './SemanticLayerDraft.module.css';
import {
    useApplySemanticLayerDraft,
    usePublishMode,
    useCheckSemanticLayerDraftImpact,
    useDiscardSemanticLayerDraft,
    useSemanticLayerDraft,
    useSemanticLayerDraftImpact,
} from './useSemanticLayerModel';
import { useDraftPullRequest } from './useStudioCheckout';
import { LineCounts } from './WorkbenchRail';

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

export const ApplyModal: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    model: string | null;
    onClose: () => void;
}> = ({ projectUuid, draft, model, onClose }) => {
    const impact = useSemanticLayerDraftImpact(projectUuid, model);
    const apply = useApplySemanticLayerDraft(projectUuid);
    const mode = usePublishMode(projectUuid);
    const asPullRequest = mode === 'pull_request';
    const { showToastSuccess, showToastWarning } = useToaster();
    const scoped = draft.models.filter(
        (entry) => model === null || entry.model === model,
    );
    const sent = useDraftPullRequest() !== null;
    const sendLabel = sent ? 'Update pull request' : 'Open pull request';
    const confirmLabel = asPullRequest ? sendLabel : 'Publish';
    const { data: project } = useProject(projectUuid);
    const branch =
        project?.dbtConnection && 'branch' in project.dbtConnection
            ? project.dbtConnection.branch
            : null;
    const into = branch ? (
        <>
            {' '}
            into <Code>{branch}</Code>
        </>
    ) : null;
    const changes = countPublishedChanges(draft, model);
    const them = changes === 1 ? 'it' : 'them';
    // Applying never waits for the check: an unchecked draft is applied knowingly, like one that breaks something.
    const isRisky =
        impact.data?.status !== 'done' || impact.data.breaks.length > 0;
    return (
        <MantineModal
            opened
            onClose={onClose}
            title={
                asPullRequest
                    ? sendLabel
                    : `Publish ${count(changes, 'change')}`
            }
            confirmLabel={isRisky ? `${confirmLabel} anyway` : confirmLabel}
            confirmLoading={apply.isLoading}
            confirmDisabled={scoped.some(
                (entry) => entry.reconciliation?.state === 'conflict',
            )}
            onConfirm={() =>
                apply.mutate(
                    { model, merge: mode === 'merge' },
                    {
                        onSuccess: ({ failures, pullRequestUrl, merge }) => {
                            if (failures.length > 0) return;
                            if (pullRequestUrl) {
                                const action = {
                                    children: 'View pull request',
                                    icon: IconExternalLink,
                                    onClick: () =>
                                        window.open(
                                            pullRequestUrl,
                                            '_blank',
                                            'noopener',
                                        ),
                                };
                                if (merge && !merge.merged) {
                                    showToastWarning({
                                        title: 'Pull request opened, not merged',
                                        subtitle: merge.reason,
                                        action,
                                    });
                                } else {
                                    showToastSuccess({
                                        title: merge?.merged
                                            ? 'Published'
                                            : sent
                                              ? 'Pull request updated'
                                              : 'Pull request opened',
                                        subtitle: merge?.merged
                                            ? 'Updating for everyone.'
                                            : undefined,
                                        action,
                                    });
                                }
                            } else {
                                showToastSuccess({
                                    title: 'Published for everyone',
                                });
                            }
                            onClose();
                        },
                    },
                )
            }
        >
            <Stack gap="md">
                <Text fz="sm" c="dimmed">
                    {mode === 'pull_request' ? (
                        <>
                            {sent ? 'Updates the' : 'Opens a'} pull request
                            {into}. Nothing is published until it merges.
                        </>
                    ) : mode === 'merge' ? (
                        <>
                            Merges{into}. Everyone on this project sees {them}{' '}
                            once it updates.
                        </>
                    ) : (
                        `Everyone on this project sees ${them} right away. You can undo from each model's History tab.`
                    )}
                </Text>
                <PublishSummary
                    projectUuid={projectUuid}
                    draft={draft}
                    model={model}
                />
                <PublishChecklist
                    draft={draft}
                    model={model}
                    breaks={
                        impact.data?.status === 'done'
                            ? impact.data.breaks.length
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

/** Publishing or discarding one model on its own, tucked into a menu: the bar above publishes the draft. */
const ModelActions: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    model: string;
}> = ({ projectUuid, draft, model }) => {
    const discard = useDiscardSemanticLayerDraft(projectUuid);
    const asPullRequest = usePublishMode(projectUuid) === 'pull_request';
    const [applying, setApplying] = useState(false);
    const [armed, setArmed] = useState(false);
    const hasConflict = countConflicts(draft, model) > 0;
    const blocked = hasConflict || cannotApply(draft, model);
    const blockedReason = hasConflict
        ? 'Choose which version to keep first.'
        : 'Some changes no longer pass their checks.';
    return (
        <>
            <Menu position="bottom-end" onClose={() => setArmed(false)}>
                <Menu.Target>
                    <ActionIcon size="sm" aria-label={`More for ${model}`}>
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        disabled={blocked}
                        title={blocked ? blockedReason : undefined}
                        onClick={() => setApplying(true)}
                    >
                        {asPullRequest
                            ? 'Open pull request for this model only'
                            : 'Publish this model only'}
                    </Menu.Item>
                    <Menu.Item
                        color="red"
                        closeMenuOnClick={armed}
                        disabled={discard.isLoading}
                        onClick={() => {
                            if (armed) discard.mutate(model);
                            setArmed(!armed);
                        }}
                    >
                        {armed
                            ? 'Click again to discard'
                            : "Discard this model's changes"}
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {applying ? (
                <ApplyModal
                    projectUuid={projectUuid}
                    draft={draft}
                    model={model}
                    onClose={() => setApplying(false)}
                />
            ) : null}
        </>
    );
};

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
                              publisher: describePublisher(publishedSince),
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
            .forEach(({ model, publisher, isConflict }) =>
                isConflict
                    ? showToastWarning({
                          title: `${publisher.subject} changed a part of ${model}${publisher.where} that this draft changes too`,
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
                          title: `${publisher.subject} published a change to ${model}${publisher.where}`,
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
    const [isTrying, setIsTrying] = useState(false);
    const discard = useDiscardSemanticLayerDraft(projectUuid);
    const { startNewThread } = useStudioAgent(projectUuid);
    const asPullRequest = usePublishMode(projectUuid) === 'pull_request';
    const sendLabel =
        useDraftPullRequest() !== null
            ? 'Update pull request'
            : 'Open pull request';
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
        <>
            <DevelopmentBar
                summary={
                    draft.models.length > 0 ? null : (
                        <Text fz="xs" c="dimmed" truncate>
                            Nothing new to publish
                        </Text>
                    )
                }
            >
                {tryModel ? (
                    <Tooltip
                        multiline
                        w={240}
                        label="Opens Explore over this page with your changes. Only you see them until you publish."
                    >
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            flex="none"
                            leftSection={
                                <MantineIcon icon={IconPlayerPlay} size={12} />
                            }
                            onClick={() => setIsTrying(true)}
                        >
                            Try it
                        </Button>
                    </Tooltip>
                ) : null}
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
                            {asPullRequest ? sendLabel : 'Publish'}
                        </Button>
                    </Tooltip>
                ) : null}
                <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                        <ActionIcon
                            size="md"
                            aria-label="More actions"
                            variant="subtle"
                            color="gray"
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {tryModel ? (
                            <Menu.Item
                                component={Link}
                                to={`/projects/${projectUuid}/tables/${encodeURIComponent(tryModel)}`}
                            >
                                Open in Explore
                            </Menu.Item>
                        ) : null}
                        <Menu.Item
                            disabled={
                                check.isLoading ||
                                impact.data?.status === 'checking'
                            }
                            onClick={() => {
                                check.mutate(undefined);
                                setSearchParams({
                                    [DRAFT_PARAM]: DRAFT_REVIEW,
                                });
                            }}
                        >
                            Check saved charts and dashboards
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                            color="red"
                            onClick={() => setDiscarding(true)}
                        >
                            Discard draft
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
                {discarding ? (
                    <MantineModal
                        opened
                        variant="delete"
                        title="Discard draft"
                        description={`${count(draft.changes.length, 'change')} in this draft will be removed. Published stays as it is, and this cannot be undone.`}
                        confirmLabel="Discard"
                        confirmLoading={discard.isLoading}
                        onClose={() => setDiscarding(false)}
                        onConfirm={() =>
                            discard.mutate(null, {
                                onSuccess: () => {
                                    setDiscarding(false);
                                    // The chat that built the draft goes with it; it stays one step back.
                                    startNewThread();
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
            {isTrying ? (
                <TryIt
                    projectUuid={projectUuid}
                    models={draft.models
                        .filter((entry) => getChangeKind(entry) !== 'removed')
                        .map(({ model }) => model)}
                    previewProjectUuid={null}
                    prUrl={null}
                    onClose={() => setIsTrying(false)}
                />
            ) : null}
        </>
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

const CHANGE_GLYPHS = { new: '+', changed: '~', removed: '−' };

type DraftProps = { projectUuid: string; draft: SemanticLayerDraft };

type DraftReviewProps = DraftProps & {
    /** Hands a request to the agent beside the review. */
    onAskAgent: (prompt: string) => void;
};

export const DraftReview: FC<DraftReviewProps> = ({
    projectUuid,
    draft,
    onAskAgent,
}) => {
    const publishesHere = usePublishMode(projectUuid) === 'live';
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
                    const fields = listPublishedParts(draft, modelChange);
                    return (
                        <Box
                            key={modelChange.model}
                            component="section"
                            className={classes.model}
                        >
                            {/* A file's header, as an editor shows one: its name, what it models, how much moved. */}
                            <Group
                                className={classes.modelHead}
                                gap="xs"
                                wrap="nowrap"
                            >
                                <MantineIcon
                                    icon={IconFileCode}
                                    color="dimmed"
                                />
                                <Text
                                    component="h3"
                                    fz="sm"
                                    fw={500}
                                    truncate
                                    flex={1}
                                    miw={0}
                                >
                                    {modelChange.model}.yml
                                    <Text span inherit fw={400} c="dimmed">
                                        {` · ${[
                                            title,
                                            subtitle ??
                                                (fields.length === 0
                                                    ? CHANGE_KIND_LABELS[
                                                          getChangeKind(
                                                              modelChange,
                                                          )
                                                      ]
                                                    : null),
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}`}
                                    </Text>
                                </Text>
                                <LineCounts
                                    counts={countChangedLines(modelChange)}
                                />
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
                                {draft.models.length > 1 && publishesHere ? (
                                    <ModelActions
                                        projectUuid={projectUuid}
                                        draft={draft}
                                        model={modelChange.model}
                                    />
                                ) : null}
                            </Group>
                            {fields.length > 0 ? (
                                <Box className={classes.fields}>
                                    {fields.map((field) => (
                                        <Group
                                            key={`${field.kind}:${field.name}`}
                                            gap={6}
                                            wrap="nowrap"
                                        >
                                            <Text
                                                span
                                                fz="xs"
                                                className={classes.glyph}
                                                data-change={field.change}
                                                aria-hidden
                                            >
                                                {CHANGE_GLYPHS[field.change]}
                                            </Text>
                                            <FieldChangeIcon field={field} />
                                            <Text fz="xs" truncate>
                                                <VisuallyHidden>
                                                    {
                                                        CHANGE_KIND_LABELS[
                                                            field.change
                                                        ]
                                                    }{' '}
                                                    {field.kind}{' '}
                                                </VisuallyHidden>
                                                {field.label}
                                                {field.detail ? (
                                                    <Text
                                                        span
                                                        inherit
                                                        c="dimmed"
                                                    >
                                                        {` · ${field.detail}`}
                                                    </Text>
                                                ) : null}
                                            </Text>
                                        </Group>
                                    ))}
                                </Box>
                            ) : null}
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
                        </Box>
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
