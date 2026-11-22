/** A model's page: its fields, its YAML for the Code view, and the history of a model kept on the server. */
import {
    type ApiError,
    type SemanticLayerModelChange,
} from '@lightdash/common';
import {
    Accordion,
    Alert,
    Badge,
    Box,
    Button,
    Group,
    Kbd,
    Paper,
    Tabs,
    Text,
    Tooltip,
    useComputedColorScheme,
} from '@mantine/core';
import {
    EditProvider,
    File,
    WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import { IconPencil } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { ChangeDiff } from './ChangeDiff';
import {
    CHANGE_KIND_VERBS,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    changeTitle,
    findFieldBlock,
    VIEW_PARAM,
} from './modelCode';
import { ModelPreAggregates } from './ModelPreAggregates';
import classes from './ModelTabs.module.css';
import { createEditor } from './pierreEditor';
import {
    useSemanticLayerModel,
    useAppliesAsPullRequest,
    useSaveDraftModel,
    useUndoSemanticLayerChanges,
} from './useSemanticLayerModel';
import { findCheckedOutModel, useStudioCheckout } from './useStudioCheckout';

/** Fades the lines around the marked definition; hovering the code brings them back. */
const ISOLATE_BLOCK_CSS = `
[data-line]:not([data-selected-line]),
[data-column-number]:not([data-selected-line]) {
    opacity: 0.3;
    transition: opacity 150ms ease;
}
:host(:hover) :is([data-line], [data-column-number]) { opacity: 1; }
`;

type Notice = { tone: 'error' | 'info'; text: string } | null;

// Only errors written for people are shown as they are; anything else is an internal detail.
const saveErrorText = ({ error }: ApiError) =>
    error.name === 'ParameterError' || error.name === 'ForbiddenError'
        ? error.message
        : 'This model could not be saved. Try again in a moment.';

/** A model's YAML as the checked-out change leaves it; your own draft's, or Published's, can be edited and saved into the draft. */
export const ModelCodeView: FC<{
    projectUuid: string;
    modelName: string;
    fieldName: string | null;
    /** Why the code is read and not edited, as a sentence; null when it can be edited. */
    readOnlyReason: string | null;
}> = ({ projectUuid, modelName, fieldName, readOnlyReason }) => {
    const colorScheme = useComputedColorScheme('light');
    const { data: model, isLoading } = useSemanticLayerModel(
        projectUuid,
        modelName,
    );
    const { shown } = useStudioCheckout();
    const drafted = findCheckedOutModel(shown, modelName);
    const isDraft = drafted !== null;
    const content = drafted ? drafted.contentAfter : (model?.content ?? null);
    const save = useSaveDraftModel(projectUuid);
    const { track } = useTracking();
    // What was just saved shows until the draft is read again.
    const [justSaved, setJustSaved] = useState<{
        over: string | null;
        content: string;
    } | null>(null);
    const isShowingSaved = justSaved !== null && justSaved.over === content;
    const shownContent = isShowingSaved ? justSaved.content : content;
    // Pierre owns the document while editing: it starts from `startedFrom` and reports each change into `text`.
    const [isEditing, setIsEditing] = useState(false);
    const [startedFrom, setStartedFrom] = useState<string | null>(null);
    const [text, setText] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const [notice, setNotice] = useState<Notice>(null);
    const canEdit =
        readOnlyReason === null && shown !== null && shownContent !== null;
    const isDirty = text !== null && text !== startedFrom;
    const editing = canEdit && (isEditing || isDirty);
    // Unsaved text stays when the model changes under it; saving it then is refused.
    const changedUnder = isDirty && startedFrom !== shownContent;
    // With nothing typed yet, editing follows the model as it changes.
    useEffect(() => {
        if (!isEditing || isDirty || startedFrom === shownContent) return;
        setStartedFrom(shownContent);
        setText(null);
        setRevision((current) => current + 1);
    }, [isEditing, isDirty, startedFrom, shownContent]);
    const block =
        fieldName && shownContent && !editing
            ? findFieldBlock(shownContent, fieldName)
            : null;
    const line = block?.start ?? null;
    // A changed file shows the draft's lines marked; a new one would be marked whole, and a field asked for is shown alone.
    const marksDraft =
        drafted !== null &&
        drafted.contentBefore !== null &&
        block === null &&
        !isShowingSaved;
    const editor = useRef<HTMLDivElement>(null);
    // The viewer marks the line but does not bring it into view, and it renders after this does.
    useEffect(() => {
        if (line === null) return undefined;
        let frame = 0;
        let tries = 0;
        const reveal = () => {
            const target = editor.current
                ?.querySelector('diffs-container')
                ?.shadowRoot?.querySelector(`[data-line="${line}"]`);
            if (target) target.scrollIntoView({ block: 'center' });
            else if (tries < 60) {
                tries += 1;
                frame = requestAnimationFrame(reveal);
            }
        };
        reveal();
        return () => cancelAnimationFrame(frame);
    }, [line, modelName]);

    const stopEditing = () => {
        setIsEditing(false);
        setStartedFrom(null);
        setText(null);
        setRevision((current) => current + 1);
    };
    const submit = () => {
        if (
            !editing ||
            text === null ||
            startedFrom === null ||
            text === startedFrom ||
            save.isLoading
        )
            return;
        save.mutate(
            { model: modelName, base: startedFrom, content: text },
            {
                onSuccess: (result) => {
                    if (result.status === 'failed') {
                        setNotice({ tone: 'error', text: result.error });
                        return;
                    }
                    setJustSaved({ over: content, content: result.content });
                    setNotice(null);
                    stopEditing();
                },
                onError: (error) =>
                    setNotice({ tone: 'error', text: saveErrorText(error) }),
            },
        );
    };

    if (isLoading) return null;
    if (!model && !isDraft) {
        return (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
                This model was deployed from elsewhere, so its YAML is not here.
            </Text>
        );
    }
    const where = shown?.workspace?.name ?? null;
    const options = {
        theme: colorScheme === 'dark' ? 'pierre-dark' : 'pierre-light',
        overflow: 'wrap',
        disableFileHeader: true,
    } as const;
    return (
        <Box className={classes.codePane}>
            <Group
                className={classes.codeToolbar}
                justify="flex-end"
                wrap="nowrap"
                gap="xs"
            >
                {shownContent === null ? null : !canEdit ? (
                    readOnlyReason ? (
                        <Text fz="xs" c="dimmed" truncate maw={320}>
                            {readOnlyReason}
                        </Text>
                    ) : null
                ) : editing ? null : (
                    <Tooltip
                        label={
                            where
                                ? `Saves to ${where}`
                                : 'Saving starts a draft. Published stays as it is.'
                        }
                    >
                        <Button
                            size="compact-xs"
                            variant="default"
                            leftSection={
                                <MantineIcon icon={IconPencil} size={12} />
                            }
                            onClick={() => {
                                track({
                                    name: EventName.SEMANTIC_STUDIO_EDIT_STARTED,
                                    properties: {
                                        projectId: projectUuid,
                                        kind: 'model',
                                    },
                                });
                                setStartedFrom(shownContent);
                                setIsEditing(true);
                                setRevision((current) => current + 1);
                            }}
                        >
                            Edit
                        </Button>
                    </Tooltip>
                )}
                {editing && !isDirty ? (
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        onClick={stopEditing}
                    >
                        Done
                    </Button>
                ) : null}
                {editing && isDirty ? (
                    <>
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            disabled={save.isLoading}
                            onClick={() => {
                                setNotice(null);
                                stopEditing();
                            }}
                        >
                            Discard
                        </Button>
                        <Tooltip
                            label={
                                <Group gap={6} wrap="nowrap">
                                    {where
                                        ? `Saves to ${where}`
                                        : 'Starts a draft'}
                                    <Kbd size="xs">⌘S</Kbd>
                                </Group>
                            }
                        >
                            <Button
                                size="compact-xs"
                                loading={save.isLoading}
                                onClick={submit}
                            >
                                {where ? 'Save' : 'Save as a new draft'}
                            </Button>
                        </Tooltip>
                    </>
                ) : null}
                {shownContent !== null ? (
                    <CopyActionIcon
                        value={text ?? shownContent}
                        copyLabel="Copy YAML"
                    />
                ) : null}
            </Group>
            {changedUnder ? (
                <Alert color="violet" radius={0} py={8}>
                    <Text fz="xs">
                        This model changed while you were editing, for example
                        by the agent. Your edits are kept here; discard them to
                        see the latest version.
                    </Text>
                </Alert>
            ) : null}
            {notice ? (
                <Alert
                    color={notice.tone === 'error' ? 'red' : 'blue'}
                    radius={0}
                    py={8}
                    withCloseButton
                    onClose={() => setNotice(null)}
                >
                    <Text fz="xs" className={classes.notice}>
                        {notice.text}
                    </Text>
                </Alert>
            ) : null}
            <Box
                className={classes.codeEditor}
                ref={editor}
                onKeyDownCapture={(event) => {
                    if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key.toLowerCase() === 's'
                    ) {
                        event.preventDefault();
                        submit();
                    }
                }}
            >
                {shownContent === null ? (
                    <Text fz="sm" c="dimmed" p="md">
                        This draft removes this model.
                    </Text>
                ) : editing ? (
                    <WorkerPoolContextProvider
                        poolOptions={PIERRE_POOL_OPTIONS}
                        highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                    >
                        <EditProvider createEditor={createEditor}>
                            <File
                                key={`${modelName}:${revision}`}
                                className={classes.codeHost}
                                file={{
                                    name: `${modelName}.yml`,
                                    contents: startedFrom ?? shownContent,
                                }}
                                options={options}
                                edit={!save.isLoading}
                                onEditChange={(event) =>
                                    setText(event.file.contents)
                                }
                                onEditComplete={() => 'accept'}
                            />
                        </EditProvider>
                    </WorkerPoolContextProvider>
                ) : marksDraft ? (
                    <WorkerPoolContextProvider
                        poolOptions={PIERRE_POOL_OPTIONS}
                        highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                    >
                        <ChangeDiff
                            modelName={modelName}
                            change={drafted}
                            variant="whole"
                        />
                    </WorkerPoolContextProvider>
                ) : (
                    <WorkerPoolContextProvider
                        poolOptions={PIERRE_POOL_OPTIONS}
                        highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                    >
                        <File
                            file={{
                                name: `${modelName}.yml`,
                                contents: shownContent,
                            }}
                            selectedLines={block}
                            options={{
                                ...options,
                                unsafeCSS: block ? ISOLATE_BLOCK_CSS : '',
                            }}
                        />
                    </WorkerPoolContextProvider>
                )}
            </Box>
        </Box>
    );
};

const HistoryPane: FC<{
    projectUuid: string;
    modelName: string;
    history: SemanticLayerModelChange[];
}> = ({ projectUuid, modelName, history }) => {
    const undo = useUndoSemanticLayerChanges(projectUuid);
    const { showToastSuccess } = useToaster();
    const [armed, setArmed] = useState<string | null>(null);
    const { shown } = useStudioCheckout();
    const [, setSearchParams] = useSearchParams();
    const unpublished = findCheckedOutModel(shown, modelName);
    const [open, setOpen] = useState<string | null>(
        history[0]?.changeSetUuid ?? null,
    );
    if (history.length === 0 && !unpublished) {
        return (
            <Paper variant="dotted" p="md">
                <Text fz="sm" c="dimmed">
                    No changes recorded yet. The next change to this model shows
                    up here.
                </Text>
            </Paper>
        );
    }
    return (
        <WorkerPoolContextProvider
            poolOptions={PIERRE_POOL_OPTIONS}
            highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
        >
            {unpublished ? (
                <Paper variant="dotted" p="sm" mb="sm">
                    <Group gap="sm" justify="space-between" wrap="nowrap">
                        <Box miw={0}>
                            <Text fz="sm">In your draft</Text>
                            <Text fz="xs" c="dimmed">
                                Not live. Only you see them until you publish;
                                everything below is live.
                            </Text>
                        </Box>
                        <Button
                            size="compact-xs"
                            variant="default"
                            flex="none"
                            onClick={() =>
                                setSearchParams({ [DRAFT_PARAM]: DRAFT_REVIEW })
                            }
                        >
                            Review
                        </Button>
                    </Group>
                </Paper>
            ) : null}
            <Accordion variant="contained" value={open} onChange={setOpen}>
                {history.map((change) => (
                    <Accordion.Item
                        key={change.changeSetUuid}
                        value={change.changeSetUuid}
                    >
                        <Group gap="xs" pr="xs" wrap="nowrap">
                            <Accordion.Control
                                className={classes.changeControl}
                            >
                                <Text
                                    fz="sm"
                                    truncate
                                    title={changeTitle(change)}
                                >
                                    {changeTitle(change)}
                                </Text>
                                <Text
                                    fz="xs"
                                    c="dimmed"
                                    truncate
                                    title={dayjs(change.createdAt).format(
                                        'YYYY-MM-DD HH:mm',
                                    )}
                                >
                                    {CHANGE_KIND_VERBS[getChangeKind(change)]}{' '}
                                    {dayjs(change.createdAt).fromNow()}
                                    {change.by ? ` by ${change.by}` : ''}
                                    {change.replaced
                                        ? `, replacing ${change.replaced.by ?? 'someone'}'s ${change.replaced.paths.join(', ')}`
                                        : ''}
                                    {change.otherModels.length > 0
                                        ? `, along with ${change.otherModels.join(', ')}`
                                        : ''}
                                </Text>
                            </Accordion.Control>
                            {change.reverted ? (
                                <Badge className={classes.undo}>Undone</Badge>
                            ) : change.source !== 'undo' ? (
                                <Button
                                    className={classes.undo}
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                    disabled={undo.isLoading}
                                    onBlur={() => setArmed(null)}
                                    onClick={() => {
                                        if (armed !== change.changeSetUuid) {
                                            setArmed(change.changeSetUuid);
                                            return;
                                        }
                                        setArmed(null);
                                        undo.mutate([change.changeSetUuid], {
                                            onSuccess: () =>
                                                showToastSuccess({
                                                    title: 'Undone for everyone',
                                                }),
                                        });
                                    }}
                                >
                                    {armed === change.changeSetUuid
                                        ? 'Confirm undo'
                                        : 'Undo'}
                                </Button>
                            ) : null}
                        </Group>
                        <Accordion.Panel>
                            {open === change.changeSetUuid ? (
                                <ChangeDiff
                                    modelName={modelName}
                                    change={change}
                                    variant="full"
                                />
                            ) : null}
                        </Accordion.Panel>
                    </Accordion.Item>
                ))}
            </Accordion>
        </WorkerPoolContextProvider>
    );
};

export const ModelTabs: FC<{
    projectUuid: string;
    modelName: string;
    /** The explore queries run on; pre-aggregates are kept by this name. */
    exploreName: string;
    fields: ReactNode;
    /** The explore's lineage: its upstream dbt models and its joins; null where it does not apply. */
    lineage?: ReactNode;
    /** Only modelled (dbt) explores have pre-aggregates; live and external sources do not. */
    isModelled: boolean;
    /** The source's own settings, for a live data source with this one explore. */
    settings?: ReactNode;
}> = ({
    projectUuid,
    modelName,
    exploreName,
    fields,
    lineage = null,
    isModelled,
    settings = null,
}) => {
    const { data: model } = useSemanticLayerModel(projectUuid, modelName);
    // A repository keeps its own history.
    const asPullRequest = useAppliesAsPullRequest(projectUuid);
    const hasHistory = !!model && !asPullRequest;
    const hasLineage = lineage !== null;
    const preAggregatesEnabled =
        useHealth().data?.preAggregates.enabled === true;
    const hasPreAggregates = isModelled && preAggregatesEnabled;
    const hasSettings = settings !== null;
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get(VIEW_PARAM);
    const view =
        hasHistory && requested === 'history'
            ? 'history'
            : hasLineage && requested === 'lineage'
              ? 'lineage'
              : hasPreAggregates && requested === 'pre-aggregates'
                ? 'pre-aggregates'
                : hasSettings && requested === 'settings'
                  ? 'settings'
                  : 'fields';
    return (
        <Tabs
            className={classes.root}
            // Settings are as tall as they are; the page scrolls them
            data-fit-content={view === 'settings' || undefined}
            value={view}
            onChange={(next) =>
                setSearchParams(
                    next === 'history' ||
                        next === 'lineage' ||
                        next === 'pre-aggregates' ||
                        next === 'settings'
                        ? { [VIEW_PARAM]: next }
                        : {},
                    { replace: true },
                )
            }
        >
            {hasHistory || hasLineage || hasPreAggregates || hasSettings ? (
                <Tabs.List mb="md">
                    <Tabs.Tab value="fields">Fields</Tabs.Tab>
                    {hasLineage ? (
                        <Tabs.Tab value="lineage">Lineage</Tabs.Tab>
                    ) : null}
                    {hasPreAggregates ? (
                        <Tabs.Tab value="pre-aggregates">
                            Pre-aggregates
                        </Tabs.Tab>
                    ) : null}
                    {hasHistory ? (
                        <Tabs.Tab value="history">History</Tabs.Tab>
                    ) : null}
                    {hasSettings ? (
                        <Tabs.Tab value="settings">Settings</Tabs.Tab>
                    ) : null}
                </Tabs.List>
            ) : null}
            <Tabs.Panel value="fields" className={classes.panel}>
                {fields}
            </Tabs.Panel>
            {view === 'lineage' ? (
                <Tabs.Panel value="lineage" className={classes.panel}>
                    {lineage}
                </Tabs.Panel>
            ) : null}
            {view === 'pre-aggregates' ? (
                <Tabs.Panel value="pre-aggregates" className={classes.panel}>
                    <ModelPreAggregates
                        projectUuid={projectUuid}
                        exploreName={exploreName}
                    />
                </Tabs.Panel>
            ) : null}
            {model && view === 'history' ? (
                <Tabs.Panel value="history" className={classes.panel}>
                    <HistoryPane
                        projectUuid={projectUuid}
                        modelName={model.name}
                        history={model.history}
                    />
                </Tabs.Panel>
            ) : null}
            {view === 'settings' ? (
                <Tabs.Panel value="settings" className={classes.panel}>
                    {settings}
                </Tabs.Panel>
            ) : null}
        </Tabs>
    );
};

/** A live data source with several explores: the explores, then its settings. */
export const SourceTabs: FC<{
    explores: ReactNode;
    settings: ReactNode;
}> = ({ explores, settings }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const view =
        searchParams.get(VIEW_PARAM) === 'settings' ? 'settings' : 'explores';
    return (
        <Tabs
            className={classes.root}
            data-fit-content
            value={view}
            onChange={(next) =>
                setSearchParams(
                    next === 'settings' ? { [VIEW_PARAM]: next } : {},
                    { replace: true },
                )
            }
        >
            <Tabs.List mb="md">
                <Tabs.Tab value="explores">Explores</Tabs.Tab>
                <Tabs.Tab value="settings">Settings</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="explores" className={classes.panel}>
                {explores}
            </Tabs.Panel>
            {view === 'settings' ? (
                <Tabs.Panel value="settings" className={classes.panel}>
                    {settings}
                </Tabs.Panel>
            ) : null}
        </Tabs>
    );
};
