/** A model's page: its fields, its YAML for the Code view, and the history of a model kept on the server. */
import {
    type ApiError,
    type SemanticLayerModelChange,
} from '@lightdash/common';
import {
    Accordion,
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Group,
    Kbd,
    Paper,
    Stack,
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
import {
    IconArrowBackUp,
    IconArrowForwardUp,
    IconFileCode,
    IconLock,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { SettingsSection } from '../externalConnections/liveSources/LiveSourceSettingsRows';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
    pierreThemeFor,
} from '../writeback/pierreDiffConfig';
import { ChangeDiff } from './ChangeDiff';
import {
    CHANGE_KIND_VERBS,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    changeTitle,
    findFieldBlock,
    MODEL_TABS,
    VIEW_PARAM,
    type ModelTab,
} from './modelCode';
import { ModelPreAggregates } from './ModelPreAggregates';
import classes from './ModelTabs.module.css';
import {
    createEditor,
    editorOptionsFor,
    leaveOnEscape,
    MOD_KEY,
    REDO_KEYS,
    pointInCode,
    type CodePoint,
    readSelection,
    type Attached,
} from './pierreEditor';
import { useAddToStudioChat } from './studioChatRefs';
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

/** A model's YAML as the checked-out change leaves it; your own draft's, or Published's, opens ready to edit and saves into the draft. */
export const ModelCodeView: FC<{
    projectUuid: string;
    modelName: string;
    fieldName: string | null;
    /** Why the code is read and not edited, as a sentence; null when it can be edited. */
    readOnlyReason: string | null;
    /** Skips the marked view and opens straight into editing, as the overview's pencil asks. */
    startsEditing: boolean;
}> = ({ projectUuid, modelName, fieldName, readOnlyReason, startsEditing }) => {
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
    const [isEditing, setIsEditing] = useState(startsEditing);
    const editorInstance = useRef<Attached | null>(null);
    // Editing asked for by a click or the overview's pencil, so the caret lands where the person pointed.
    const openAt = useRef<{ point: CodePoint | null } | null>(
        startsEditing ? { point: null } : null,
    );
    const [history, setHistory] = useState({ canUndo: false, canRedo: false });
    const addToStudioChat = useAddToStudioChat();
    const addToChat = () => {
        const picked = readSelection(editorInstance.current);
        if (!picked || !addToStudioChat) return false;
        addToStudioChat({
            modelName,
            fieldName: null,
            modelLabel: `${modelName}.yml`,
            fieldLabel: null,
            fieldKind: null,
            fieldType: null,
            code: { path: `${modelName}.yml`, ...picked },
        });
        return true;
    };
    // Pierre keeps the first options it is given, so the chip reads the latest through a ref.
    const addToChatRef = useRef(addToChat);
    addToChatRef.current = addToChat;
    const editorOptions = useMemo(
        () =>
            editorOptionsFor<'file'>(
                (attached) => {
                    editorInstance.current = attached;
                    setHistory({ canUndo: false, canRedo: false });
                    const asked = openAt.current;
                    openAt.current = null;
                    if (asked)
                        requestAnimationFrame(() => {
                            if (editorInstance.current === attached)
                                attached.focus(asked.point ?? undefined);
                        });
                },
                () => addToChatRef.current(),
            ),
        [],
    );
    const [startedFrom, setStartedFrom] = useState<string | null>(null);
    const [text, setText] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const [notice, setNotice] = useState<Notice>(null);
    const canEdit =
        readOnlyReason === null && shown !== null && shownContent !== null;
    const isDirty = text !== null && text !== startedFrom;
    const fieldBlock =
        fieldName && shownContent
            ? findFieldBlock(shownContent, fieldName)
            : null;
    // A field asked for, or the draft's marked lines, read first; clicking the code edits it.
    const hasReadView =
        fieldBlock !== null ||
        (drafted !== null && drafted.contentBefore !== null && !isShowingSaved);
    const editing = canEdit && (isEditing || isDirty || !hasReadView);
    // Unsaved text stays when the model changes under it; saving it then is refused.
    const changedUnder = isDirty && startedFrom !== shownContent;
    // With nothing typed yet, editing follows the model as it changes.
    useEffect(() => {
        if (!editing || isDirty || startedFrom === shownContent) return;
        setStartedFrom(shownContent);
        setText(null);
        setRevision((current) => current + 1);
    }, [editing, isDirty, startedFrom, shownContent]);
    const block = editing ? null : fieldBlock;
    const line = block?.start ?? null;
    // A changed file shows the draft's lines marked; a new one would be marked whole, and a field asked for is shown alone.
    const marksDraft = !editing && hasReadView && block === null;
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

    const startEditing = (event: MouseEvent) => {
        if (!canEdit) return;
        openAt.current = { point: pointInCode(event) };
        setStartedFrom(shownContent);
        setIsEditing(true);
        setRevision((current) => current + 1);
    };
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
                    const savedTo = shown?.workspace?.name;
                    setNotice({
                        tone: 'info',
                        text: savedTo
                            ? `Saved to ${savedTo}.`
                            : 'Saved as a new draft.',
                    });
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
        ...pierreThemeFor(colorScheme),
        overflow: 'wrap',
        disableFileHeader: true,
    } as const;
    return (
        <Box className={classes.codePane}>
            <Group className={classes.codeToolbar} wrap="nowrap" gap="xs">
                <MantineIcon icon={IconFileCode} color="dimmed" />
                <Text fz="sm" fw={500} truncate flex={1} miw={0}>
                    {modelName}.yml
                </Text>
                {shownContent === null ? null : !canEdit ? (
                    readOnlyReason ? (
                        <Group gap={4} wrap="nowrap" miw={0}>
                            <MantineIcon
                                icon={IconLock}
                                size={14}
                                color="dimmed"
                            />
                            <Text
                                fz="xs"
                                c="dimmed"
                                truncate
                                maw={320}
                                title={readOnlyReason}
                            >
                                {readOnlyReason}
                            </Text>
                        </Group>
                    ) : null
                ) : !isDirty ? (
                    <Text fz="xs" c="dimmed" truncate maw={240}>
                        {where ? `Saves to ${where}` : 'Saving starts a draft'}
                    </Text>
                ) : null}
                {editing ? (
                    <>
                        <Tooltip label={`Undo (${MOD_KEY}Z)`}>
                            <ActionIcon
                                aria-label="Undo"
                                className={classes.history}
                                disabled={!history.canUndo}
                                onClick={() => editorInstance.current?.undo()}
                            >
                                <MantineIcon icon={IconArrowBackUp} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label={`Redo (${REDO_KEYS})`}>
                            <ActionIcon
                                aria-label="Redo"
                                className={classes.history}
                                disabled={!history.canRedo}
                                onClick={() => editorInstance.current?.redo()}
                            >
                                <MantineIcon icon={IconArrowForwardUp} />
                            </ActionIcon>
                        </Tooltip>
                    </>
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
                                    <Kbd size="xs">{`${MOD_KEY}S`}</Kbd>
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
                    leaveOnEscape(event.nativeEvent, editorInstance.current);
                    if (!(event.metaKey || event.ctrlKey)) return;
                    const key = event.key.toLowerCase();
                    if (key === 's') {
                        event.preventDefault();
                        submit();
                    } else if (key === 'l' && addToChat()) {
                        event.preventDefault();
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
                                file={{
                                    name: `${modelName}.yml`,
                                    contents: startedFrom ?? shownContent,
                                }}
                                options={options}
                                editorOptions={editorOptions}
                                edit={!save.isLoading}
                                onEditChange={(event) => {
                                    if (notice?.tone === 'info')
                                        setNotice(null);
                                    if (text === null) {
                                        track({
                                            name: EventName.SEMANTIC_STUDIO_EDIT_STARTED,
                                            properties: {
                                                projectId: projectUuid,
                                                kind: 'model',
                                            },
                                        });
                                    }
                                    setText(event.file.contents);
                                    setHistory({
                                        canUndo: event.editor.canUndo,
                                        canRedo: event.editor.canRedo,
                                    });
                                }}
                                onEditComplete={() => 'accept'}
                            />
                        </EditProvider>
                    </WorkerPoolContextProvider>
                ) : marksDraft && drafted ? (
                    <Box
                        className={canEdit ? classes.clickToEdit : undefined}
                        onClick={(event) => startEditing(event.nativeEvent)}
                    >
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
                    </Box>
                ) : (
                    <Box
                        className={canEdit ? classes.clickToEdit : undefined}
                        onClick={(event) => startEditing(event.nativeEvent)}
                    >
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
                    </Box>
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
                                Not live until you publish, and only you can
                                change them. Everything below is live.
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
    const view: ModelTab =
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
            // Fields and settings are as tall as they are; the page scrolls
            // them, and the field list virtualises against that scroll
            data-fit-content={
                view === 'fields' || view === 'settings' || undefined
            }
            value={view}
            onChange={(next) => {
                const tab = MODEL_TABS.find((item) => item === next);
                setSearchParams(
                    tab && tab !== 'fields' ? { [VIEW_PARAM]: tab } : {},
                    { replace: true },
                );
            }}
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

/**
 * A live data source on one page: its explores (or, with one explore, its
 * fields), then its settings. A settings link scrolls to them.
 */
export const LiveSourceFlow: FC<{
    /** Omitted where the page title already says what the main part is. */
    title?: string;
    main: ReactNode;
    settings: ReactNode;
}> = ({ title, main, settings }) => {
    const [searchParams] = useSearchParams();
    const wantsSettings = searchParams.get(VIEW_PARAM) === 'settings';
    const settingsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!wantsSettings) return undefined;
        // After the explores or fields above have laid out
        const frame = requestAnimationFrame(() =>
            settingsRef.current?.scrollIntoView({ block: 'start' }),
        );
        return () => cancelAnimationFrame(frame);
    }, [wantsSettings]);
    return (
        <Box className={classes.root} data-fit-content>
            <Stack gap="lg">
                {title ? (
                    <SettingsSection title={title}>{main}</SettingsSection>
                ) : (
                    main
                )}
                <Box ref={settingsRef}>{settings}</Box>
            </Stack>
        </Box>
    );
};
