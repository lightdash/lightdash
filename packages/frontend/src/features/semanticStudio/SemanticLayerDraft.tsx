/** The person's draft of the semantic layer: its review page, and the check before it goes live. */
import {
    SEMANTIC_STUDIO_PROJECT_CONTEXT_FILE,
    type SemanticLayerDraft,
    type SemanticLayerDraftProjectContext,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
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
    IconChevronDown,
    IconDots,
    IconExternalLink,
    IconFileCode,
    IconPencil,
} from '@tabler/icons-react';
import { uniqBy } from 'es-toolkit/compat';
import {
    Fragment,
    useContext,
    useEffect,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import {
    AGENT_WORKING_HINT,
    useStudioAgentWorking,
} from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../writeback/pierreDiffConfig';
import { ChangeDiff } from './ChangeDiff';
import { DevelopmentBar } from './DevelopmentBar';
import { useDevelopmentView } from './developmentView';
import {
    ChangeQueue,
    DraftUsage,
    ModelNotices,
    PublishChecklist,
    PublishSummary,
} from './DraftInsights';
import { MarkPublishedContext } from './draftMarks';
import { cannotApply, describePublisher } from './draftState';
import { FieldChangeIcon } from './KindTypeIcon';
import { LineCounts } from './LineCounts';
import {
    CHANGE_KIND_LABELS,
    count,
    CHANGE_GLYPHS,
    countChangedLines,
    countPublishedChanges,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    listFieldChanges,
    listPublishedParts,
    refusalText,
} from './modelCode';
import { IS_STUDIO_PROTO } from './protoFlag';
import classes from './SemanticLayerDraft.module.css';
import { getSemanticStudioUrl } from './urls';
import {
    useApplySemanticLayerDraft,
    usePublishMode,
    useCheckSemanticLayerDraftImpact,
    useDiscardSemanticLayerDraft,
    useSemanticLayerDraft,
    useSemanticLayerDraftImpact,
} from './useSemanticLayerModel';
import { useDraftPullRequest } from './useStudioCheckout';

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
    const isAgentWorking = useStudioAgentWorking(projectUuid);
    const mode = usePublishMode(projectUuid);
    const asPullRequest = mode === 'pull_request';
    const { showToastSuccess, showToastWarning } = useToaster();
    const navigate = useNavigate();
    const markPublished = useContext(MarkPublishedContext);
    const scoped = draft.models.filter(
        (entry) => model === null || entry.model === model,
    );
    /** Marks what went live, and opens the model when the publish touched only one. */
    const followThrough = (isLive: boolean) => {
        if (isLive) {
            markPublished(
                new Map(
                    scoped.map((entry) => [
                        entry.model,
                        {
                            kind: getChangeKind(entry),
                            fields: listFieldChanges(
                                entry.model,
                                draft.changes.flatMap((change) =>
                                    change.models
                                        .filter(
                                            (part) =>
                                                part.model === entry.model,
                                        )
                                        .flatMap((part) => part.changes),
                                ),
                                entry,
                            ),
                        },
                    ]),
                ),
            );
        }
        const only = scoped.length === 1 ? scoped[0] : null;
        // A model a pull request adds or removes has no page to open yet.
        if (
            only &&
            only.contentAfter !== null &&
            (only.contentBefore !== null || isLive)
        ) {
            void navigate(
                getSemanticStudioUrl(projectUuid, {
                    ref: { type: 'explore', exploreId: only.model },
                }),
            );
        }
    };
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
            confirmDisabled={isAgentWorking}
            onConfirm={() =>
                // A promise, since the bar holding this modal leaves with the draft before a callback would run.
                void apply.mutateAsync({ model, merge: mode === 'merge' }).then(
                    ({ failures, pullRequestUrl, merge }) => {
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
                        followThrough(
                            !pullRequestUrl || merge?.merged === true,
                        );
                        onClose();
                    },
                    // The hook reports a failed publish.
                    () => {},
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
    const isAgentWorking = useStudioAgentWorking(projectUuid);
    const blocked = isAgentWorking || cannotApply(draft, model);
    const blockedReason = isAgentWorking
        ? AGENT_WORKING_HINT
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
                          publisher: describePublisher(publishedSince),
                      },
                  ]
                : [],
        );
        const known = seen.current;
        seen.current = new Set(current.map(({ key }) => key));
        if (known === null) return;
        current
            .filter(({ key }) => !known.has(key))
            .forEach(({ model, publisher }) =>
                showToastInfo({
                    title: `${publisher.subject} published a change to ${model}${publisher.where}`,
                    subtitle:
                        'Your review now shows what publishing would change.',
                }),
            );
    }, [draft, showToastInfo]);
};

/** The project context file as the draft leaves it, read like a model's file. */
export const ProjectContextDraftFile: FC<{
    change: SemanticLayerDraftProjectContext;
    variant: 'full' | 'whole';
}> = ({ change, variant }) => (
    <Box component="section" className={classes.model}>
        <Group className={classes.modelHead} gap="xs" wrap="nowrap">
            <MantineIcon icon={IconFileCode} color="dimmed" />
            <Text component="h3" fz="sm" fw={500} truncate flex={1} miw={0}>
                {SEMANTIC_STUDIO_PROJECT_CONTEXT_FILE}.yml
            </Text>
            <LineCounts counts={countChangedLines(change)} />
        </Group>
        <ChangeDiff
            modelName={SEMANTIC_STUDIO_PROJECT_CONTEXT_FILE}
            change={change}
            variant={variant}
        />
    </Box>
);

// Prototype: Publish stands alone, with its other actions in a quiet menu beside it
const PublishGroup = IS_STUDIO_PROTO ? Fragment : Button.Group;

/** A draft in the toolbar: what it changes, the way to its review and back, and publishing it. */
export const DraftDevelopmentBar: FC<{
    projectUuid: string;
    onDiscarded: () => void;
}> = ({ projectUuid, onDiscarded }) => {
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const [, setSearchParams] = useSearchParams();
    const [publishing, setPublishing] = useState(false);
    const [discarding, setDiscarding] = useState(false);
    const [isPreviewing, setIsPreviewing] = useDevelopmentView();
    const discard = useDiscardSemanticLayerDraft(projectUuid);
    const asPullRequest = usePublishMode(projectUuid) === 'pull_request';
    const sendLabel =
        useDraftPullRequest() !== null
            ? 'Update pull request'
            : 'Open pull request';
    const impact = useSemanticLayerDraftImpact(projectUuid, null);
    const check = useCheckSemanticLayerDraftImpact(projectUuid);
    const isAgentWorking = useStudioAgentWorking(projectUuid);
    const isEmpty = !draft || draft.changes.length === 0;
    const hasPublishable =
        !!draft && (draft.models.length > 0 || draft.projectContext !== null);
    usePublishedUnderNotice(draft);
    // Once nothing is in development there is nothing to preview.
    useEffect(() => {
        if (draft && isEmpty && isPreviewing) setIsPreviewing(false);
    }, [draft, isEmpty, isPreviewing, setIsPreviewing]);
    if (isEmpty) return null;
    const isInvalid = cannotApply(draft, null);
    const blocked = isAgentWorking || isInvalid;
    const showsPublish = hasPublishable;
    const tryModel =
        draft.models.find((entry) => getChangeKind(entry) !== 'removed')
            ?.model ?? null;
    const moreMenu = (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                {showsPublish && !IS_STUDIO_PROTO ? (
                    <Button
                        size="xs"
                        px={6}
                        aria-label="More actions"
                        className={classes.publishMore}
                    >
                        <MantineIcon icon={IconChevronDown} />
                    </Button>
                ) : (
                    <ActionIcon
                        size="md"
                        aria-label="More actions"
                        variant="subtle"
                        color="gray"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                )}
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
                        check.isLoading || impact.data?.status === 'checking'
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
                <Menu.Item color="red" onClick={() => setDiscarding(true)}>
                    Discard draft
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
    return (
        <>
            <DevelopmentBar
                summary={
                    hasPublishable ? null : (
                        <Text fz="xs" c="dimmed" truncate>
                            Nothing new to publish
                        </Text>
                    )
                }
            >
                {showsPublish ? (
                    <PublishGroup>
                        <Tooltip
                            label={
                                isAgentWorking
                                    ? AGENT_WORKING_HINT
                                    : 'Some changes no longer pass their checks.'
                            }
                            disabled={!blocked}
                            events={{ hover: true, focus: true, touch: false }}
                        >
                            <Button
                                size="xs"
                                leftSection={
                                    isAgentWorking ? (
                                        <Loader
                                            size={12}
                                            color="currentColor"
                                        />
                                    ) : null
                                }
                                data-disabled={
                                    (!isAgentWorking && isInvalid) || undefined
                                }
                                aria-disabled={blocked}
                                aria-busy={isAgentWorking}
                                onClick={() => {
                                    if (!blocked) setPublishing(true);
                                }}
                            >
                                {asPullRequest ? sendLabel : 'Publish'}
                            </Button>
                        </Tooltip>
                        {moreMenu}
                    </PublishGroup>
                ) : (
                    moreMenu
                )}
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
                                    onDiscarded();
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
        </>
    );
};

/** What the draft left out, could not do, or did not need to do. */
const DraftNotes: FC<{ draft: SemanticLayerDraft }> = ({ draft }) => {
    const entries = draft.changes.flatMap((change) => change.models);
    // Parts a later publish removed read as one line per model, not one per part.
    const gone = new Map<string, number>();
    const isGone = (model: string, reason: string) =>
        (reason === 'not_found' || reason === 'incomplete') &&
        draft.models.some(
            (entry) => entry.model === model && entry.publishedSince,
        );
    entries.forEach(({ model, refusals }) =>
        refusals.forEach(({ reason }) => {
            if (isGone(model, reason))
                gone.set(model, (gone.get(model) ?? 0) + 1);
        }),
    );
    const notes = [
        ...[...gone].map(([model, n]) => {
            const { subject } = describePublisher(
                draft.models.find((entry) => entry.model === model)
                    ?.publishedSince ?? null,
            );
            return {
                text: `${count(n, 'change')} to ${model} no longer ${n === 1 ? 'applies' : 'apply'}. ${subject} removed the parts they were on.`,
                color: 'dimmed',
            };
        }),
        ...entries.flatMap(({ model, changes, refusals, error }) => [
            ...refusals
                .filter(({ reason }) => !isGone(model, reason))
                .map((refusal) => ({
                    text: refusalText(model, refusal),
                    color: 'dimmed',
                })),
            ...(error ? [{ text: `${model}: ${error}`, color: 'red' }] : []),
            ...(!error && changes.length === 0 && refusals.length === 0
                ? [{ text: `${model} already has this.`, color: 'dimmed' }]
                : []),
        ]),
    ];
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
    /** Opens a model's file in the code view. */
    onOpenFile: (model: string) => void;
};

export const DraftReview: FC<DraftReviewProps> = ({
    projectUuid,
    draft,
    onAskAgent,
    onOpenFile,
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
                {draft.projectContext ? (
                    <ProjectContextDraftFile
                        change={draft.projectContext}
                        variant="full"
                    />
                ) : null}
                {draft.models.map((modelChange) => {
                    const fields = listPublishedParts(draft, modelChange);
                    return (
                        <Box
                            key={modelChange.model}
                            component="section"
                            className={classes.model}
                        >
                            {/* A file's header, as an editor shows one: its name and how much moved. */}
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
                                    miw={0}
                                >
                                    {modelChange.model}.yml
                                </Text>
                                <Button
                                    size="compact-xs"
                                    variant="light"
                                    color="gray"
                                    flex="none"
                                    className={classes.editFile}
                                    leftSection={
                                        <MantineIcon icon={IconPencil} />
                                    }
                                    aria-label={`Edit ${modelChange.model}.yml`}
                                    onClick={() =>
                                        onOpenFile(modelChange.model)
                                    }
                                >
                                    Edit
                                </Button>
                                <Box flex={1} />
                                <LineCounts
                                    counts={countChangedLines(modelChange)}
                                />
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
                            <ModelNotices model={modelChange} />
                            <ChangeDiff
                                modelName={modelChange.model}
                                change={modelChange}
                                variant="full"
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
                className={classes.model}
            />
        </Stack>
    );
};
