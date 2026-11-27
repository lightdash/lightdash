/** Sources: the project's YAML and SQL as code, like an IDE: edit, see what the change does, ask the agent. */
import { lintDbtYaml, type ApiError } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Group,
    Kbd,
    Loader,
    Menu,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
    useComputedColorScheme,
} from '@mantine/core';
import { EditStateManager } from '@pierre/diffs/edit';
import {
    EditProvider,
    File,
    MultiFileDiff,
    WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import { type FileTreeIconConfig } from '@pierre/trees';
import { FileTree, useFileTree } from '@pierre/trees/react';
import {
    IconArrowBackUp,
    IconArrowForwardUp,
    IconCheck,
    IconGitCompare,
    IconLock,
    IconListDetails,
    IconSearch,
} from '@tabler/icons-react';
import {
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    useContext,
} from 'react';
import { useSearchParams } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
    pierreThemeFor,
} from '../writeback/pierreDiffConfig';
import {
    countPatchLines,
    isSameFile,
    patchPathOf,
    splitPatchIntoFiles,
} from '../writeback/splitPatch';
import { useWholePullRequestDiff } from '../writeback/usePullRequestDiff';
import { FIELD_PARAM, findFieldLine } from './modelCode';
import tabClasses from './ModelTabs.module.css';
import {
    createEditor,
    editorOptionsFor,
    leaveOnEscape,
    MOD_KEY,
    pointInCode,
    readSelection,
    REDO_KEYS,
    replaceText,
    type Attached,
} from './pierreEditor';
import { applyProposal, fileBefore } from './proposedFile';
import {
    IS_STUDIO_PROTO,
    ProtoFileSearchContext,
    protoPlace,
} from './protoFlag';
import classes from './SourcesView.module.css';
import { type StartStudioThread, type StoredThread } from './studioChange';
import { type StudioChatRef } from './studioChatRefs';
import {
    dropUnsaved,
    findUnsaved,
    keepUnsaved,
    moveUnsaved,
    unsavedEditKey,
    useUnsavedPaths,
} from './unsavedEdits';
import {
    modelNameOfSourcePath,
    SOURCE_PARAM,
    useSaveStudioSource,
    useStudioSourceFile,
    useStudioSources,
} from './useStudioSources';
import railClasses from './WorkbenchRail.module.css';

/** Where the code view reads from and saves to: a change's pull request, or live. */
export type SourcesTarget = {
    projectUuid: string;
    prUrl: string | null;
    /** The change's latest commit, so a save by the agent shows up here. */
    head: string | null;
    threadUuid: string | null;
    /** On live, the agent a save's new change talks to. */
    newChangeAgentUuid: string | null;
    startThread: StartStudioThread;
    /** What the change is called, or null on live. */
    changeName: string | null;
    /** Why it is read and not edited, as a sentence, such as on someone else's change or one that ended; null when it can be edited. */
    readOnlyReason: string | null;
};

type ChangedFile = {
    path: string;
    additions: number;
    deletions: number;
    isNew: boolean;
    /** Only in the agent's latest proposal, not yet in the change. */
    isProposed: boolean;
    patch: string;
};

const fileName = (path: string) => path.split('/').pop() ?? path;

const ancestorsOf = (path: string | null) =>
    (path ?? '')
        .split('/')
        .slice(0, -1)
        .map((_, index, parts) => `${parts.slice(0, index + 1).join('/')}/`);

/** The files this change touches, by their path in the project, then those the agent proposes on top. */
const useChangedFiles = (
    { projectUuid, prUrl, head }: SourcesTarget,
    files: string[],
    proposal: string[],
): ChangedFile[] => {
    const { data } = useWholePullRequestDiff(projectUuid, prUrl ?? '', head);
    const changed = useMemo(
        () =>
            prUrl && data?.diff
                ? splitPatchIntoFiles(data.diff).map(
                      ({ path, patch, additions, deletions, isNew }) => ({
                          // The diff is by repository path; files are by project path.
                          path:
                              files.find((file) => isSameFile(path, file)) ??
                              path,
                          additions,
                          deletions,
                          isNew,
                          isProposed: false,
                          patch,
                      }),
                  )
                : [],
        [prUrl, data, files],
    );
    return useMemo(
        () => [
            ...changed,
            ...proposal.flatMap((code) => {
                const path = patchPathOf(code);
                return path && !changed.some((change) => change.path === path)
                    ? [
                          {
                              path,
                              additions: countPatchLines(code, '+'),
                              deletions: countPatchLines(code, '-'),
                              isNew: false,
                              isProposed: true,
                              patch: code,
                          },
                      ]
                    : [];
            }),
        ],
        [changed, proposal],
    );
};

const useOpenFile = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const open = (path: string | null) =>
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (path) next.set(SOURCE_PARAM, path);
                else next.delete(SOURCE_PARAM);
                return next;
            },
            { replace: true },
        );
    return [searchParams.get(SOURCE_PARAM), open] as const;
};

const symbol = (id: string, color: string, paths: string) =>
    `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--mantine-color-${color})">${paths}</symbol>`;

// Thin Tabler outlines in the app's palette: SQL as data, YAML as config, the project file as the project.
const SOURCE_ICONS: FileTreeIconConfig = {
    set: 'minimal',
    spriteSheet: `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position: absolute">${[
        symbol(
            'source-sql',
            'indigo-5',
            '<path d="M12 6m-8 0a8 3 0 1 0 16 0a8 3 0 1 0 -16 0"/><path d="M4 6v6a8 3 0 0 0 16 0v-6"/><path d="M4 12v6a8 3 0 0 0 16 0v-6"/>',
        ),
        symbol(
            'source-yaml',
            'orange-6',
            '<path d="M7 4a2 2 0 0 0 -2 2v3a2 3 0 0 1 -2 3a2 3 0 0 1 2 3v3a2 2 0 0 0 2 2"/><path d="M17 4a2 2 0 0 1 2 2v3a2 3 0 0 0 2 3a2 3 0 0 0 -2 3v3a2 2 0 0 1 -2 2"/>',
        ),
        symbol(
            'source-project',
            'teal-6',
            '<path d="M19.875 6.27a2.225 2.225 0 0 1 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033z"/><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/>',
        ),
    ].join('')}</svg>`,
    byFileExtension: {
        sql: 'source-sql',
        yml: 'source-yaml',
        yaml: 'source-yaml',
    },
    byFileName: { 'dbt_project.yml': 'source-project' },
};

/** The explorer: every YAML and SQL file as a tree, with what the change touches marked like git does. */
export const SourcesRail: FC<{
    target: SourcesTarget;
    proposal: string[];
    /** The proposal is a save of the agent's that is running. */
    isSaving: boolean;
    /** On a change, nothing open is its overview, listed first. */
    hasOverview: boolean;
}> = ({ target, proposal, isSaving, hasOverview }) => {
    const { data, isLoading, error } = useStudioSources(
        target.projectUuid,
        target.prUrl,
        target.head,
    );
    const all = useMemo(() => data?.files ?? [], [data]);
    const changes = useChangedFiles(target, all, proposal);
    const [selected, open] = useOpenFile();
    // Like opening a pull request: with nothing open, the first file it changes opens.
    const firstChange = changes[0]?.path ?? null;
    useEffect(() => {
        if (!hasOverview && !selected && firstChange) open(firstChange);
    }, [hasOverview, selected, firstChange, open]);
    // The tree keeps its first options, so its listener reads the latest through a ref.
    const fileSet = useMemo(() => new Set(all), [all]);
    const unsaved = useUnsavedPaths(target.projectUuid, target.prUrl);
    const syncing = useRef(false);
    const latest = useRef({ open, selected, files: fileSet, unsaved });
    latest.current = { open, selected, files: fileSet, unsaved };
    const { model } = useFileTree({
        paths: [],
        icons: SOURCE_ICONS,
        fileTreeSearchMode: 'hide-non-matches',
        density: 'compact',
        // Matches --trees-row-height, or the tree under-counts its height and cuts its last rows
        itemHeight: 28,
        // Like an editor's explorer: folders closed except the way to the open file.
        initialExpansion: 'closed',
        initialExpandedPaths: ancestorsOf(selected),
        flattenEmptyDirectories: true,
        initialSelectedPaths: selected ? [selected] : [],
        renderRowDecoration: ({ item }) =>
            latest.current.unsaved.has(item.path)
                ? { text: '●', title: 'Unsaved edits' }
                : null,
        onSelectionChange: (paths) => {
            // Selections made here to follow the open file are not the person choosing one
            if (syncing.current) return;
            const [path] = paths;
            // Prototype: marking the open file's pair is not a choice of file
            if (
                IS_STUDIO_PROTO &&
                latest.current.selected &&
                paths.includes(latest.current.selected)
            )
                return;
            if (path && latest.current.files.has(path)) {
                latest.current.open(path);
            }
        },
    });
    useEffect(
        () =>
            model.resetPaths(all, {
                initialExpandedPaths: ancestorsOf(latest.current.selected),
            }),
        [model, all],
    );
    // The open file can change from outside the tree, and a reset drops what was selected.
    useEffect(() => {
        const shown = model.getSelectedPaths();
        if (!selected || !fileSet.has(selected)) return;
        // Prototype: a model's YAML and SQL open together, so both are marked
        const wanted = IS_STUDIO_PROTO
            ? [...fileSet].filter(
                  (path) =>
                      path === selected ||
                      (/\.(ya?ml|sql)$/.test(path) &&
                          path.replace(/\.(ya?ml|sql)$/, '') ===
                              selected.replace(/\.(ya?ml|sql)$/, '')),
              )
            : [selected];
        if (
            shown.length === wanted.length &&
            wanted.every((path) => shown.includes(path))
        )
            return;
        syncing.current = true;
        shown.forEach((path) => model.getItem(path)?.deselect());
        // The open file first: the tree reports each selection as it is made
        [selected, ...wanted.filter((path) => path !== selected)].forEach(
            (path) => model.getItem(path)?.select(),
        );
        syncing.current = false;
    }, [model, fileSet, selected]);
    useEffect(
        () =>
            model.setGitStatus(
                changes.map((change) => ({
                    path: change.path,
                    status: change.isNew ? 'added' : 'modified',
                })),
            ),
        [model, changes],
    );
    // The tree has no redraw of its own; setting its icons redraws the unsaved marks.
    useEffect(() => model.setIcons(SOURCE_ICONS), [model, unsaved]);
    const [search, setSearch] = useState('');
    // Prototype: searched from the sidebar's own box when it has one
    const sharedSearch = useContext(ProtoFileSearchContext);
    useEffect(() => {
        if (sharedSearch !== null) model.setSearch(sharedSearch.trim() || null);
    }, [model, sharedSearch]);
    return (
        <Box className={railClasses.rail}>
            <Box
                className={railClasses.railHeader}
                display={sharedSearch === null ? undefined : 'none'}
            >
                <TextInput
                    size="xs"
                    flex={1}
                    placeholder="Search files"
                    aria-label="Search files"
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    value={search}
                    onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        model.setSearch(event.currentTarget.value || null);
                    }}
                />
            </Box>
            {changes.length > 0 || hasOverview ? (
                <Box className={classes.sourceChanges}>
                    {hasOverview ? (
                        <UnstyledButton
                            className={classes.sourceChange}
                            data-active={!selected || undefined}
                            onClick={() => open(null)}
                        >
                            <MantineIcon icon={IconListDetails} size={14} />
                            <Text fz="sm" flex={1}>
                                Overview
                            </Text>
                        </UnstyledButton>
                    ) : null}
                    {changes.map((change) => (
                        <UnstyledButton
                            key={change.path}
                            className={classes.sourceChange}
                            data-nested={hasOverview || undefined}
                            data-active={change.path === selected || undefined}
                            title={change.path}
                            onClick={() => open(change.path)}
                        >
                            <Text fz="sm" truncate flex="none" maw="60%">
                                {fileName(change.path)}
                            </Text>
                            <Text fz="xs" c="dimmed" truncate flex={1}>
                                {change.isProposed
                                    ? isSaving
                                        ? 'being saved'
                                        : 'proposed'
                                    : change.path
                                          .split('/')
                                          .slice(0, -1)
                                          .join('/')}
                            </Text>
                            <Text fz="xs" c="green.7" flex="none">
                                +{change.additions}
                            </Text>
                            <Text fz="xs" c="red.7" flex="none">
                                −{change.deletions}
                            </Text>
                        </UnstyledButton>
                    ))}
                </Box>
            ) : null}
            {isLoading ? (
                <Group justify="center" py="md">
                    <Loader size="xs" color="gray" />
                </Group>
            ) : error ? (
                <Text fz="xs" c="dimmed" p="xs">
                    {error.error.message}
                </Text>
            ) : (
                <FileTree
                    model={model}
                    className={`${classes.sourceTree} ${classes.sourceHost}`}
                />
            )}
        </Box>
    );
};

type Notice = { tone: 'error' | 'info'; text: string } | null;

type Layout = 'code' | 'diff' | 'split';

// Only errors written for people are shown as they are; anything else is an internal detail.
const saveErrorText = ({ error }: ApiError) =>
    error.name === 'ParameterError' || error.name === 'ForbiddenError'
        ? error.message
        : 'This file could not be saved. Try again in a moment.';

/** One file as code: edit it, see what the change does to it, save it into the change, or add lines to the chat. */
// The linter knows model and source properties; dbt's own project files are another shape.
const isDbtPropertiesFile = (path: string) =>
    /\.ya?ml$/.test(path) &&
    !/(^|\/)(dbt_project|packages|dependencies|profiles|selectors)\.ya?ml$/.test(
        path,
    );

export const SourcePane: FC<{
    target: SourcesTarget;
    onSaved: (prUrl: string, thread: StoredThread | null) => void;
    onAddToChat: (ref: StudioChatRef) => void;
    proposal: string[];
    /** The proposal is a save of the agent's that is running, so it is shown and not saved again. */
    isSaving: boolean;
    /** Prototype: shows this file whatever the address names, so a model's two files open side by side. */
    file?: string;
}> = ({
    target,
    onSaved,
    onAddToChat,
    proposal,
    isSaving,
    file: shownFile,
}) => {
    const colorScheme = useComputedColorScheme('light');
    const canEdit = target.readOnlyReason === null;
    const [openPath] = useOpenFile();
    const path = shownFile ?? openPath;
    const { data: sources } = useStudioSources(
        target.projectUuid,
        target.prUrl,
        target.head,
    );
    const files = useMemo(() => sources?.files ?? [], [sources]);
    const change =
        useChangedFiles(target, files, proposal).find(
            (entry) => entry.path === path,
        ) ?? null;
    const isChangedFile = !!change && !change.isProposed;
    const {
        data: file,
        isFetching,
        error: readError,
        refetch,
    } = useStudioSourceFile(
        target.projectUuid,
        target.prUrl,
        target.head,
        path,
    );
    const { data: live } = useStudioSourceFile(
        target.projectUuid,
        null,
        null,
        isChangedFile && canEdit ? path : null,
    );
    // A change you only read is shown against itself, since live may have moved on since.
    const before =
        !canEdit && change && path && file?.content
            ? change.isNew
                ? ''
                : fileBefore(change.patch, path, file.content)
            : null;
    const save = useSaveStudioSource(target.projectUuid, target.startThread);
    const [layout, setLayout] = useState<Layout>('diff');
    // A file typed in before its comparison loaded stays as code, so the view does not change under the cursor.
    const [typedAsCode, setTypedAsCode] = useState<string | null>(null);
    // Pierre owns the document while editing: it starts from what it is mounted with and reports each change into `text`.
    const [text, setText] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const [notice, setNotice] = useState<Notice>(null);
    // What the agent's proposal was applied to, so its diff shows against it; null when it is not in the editor.
    const [proposedFrom, setProposedFrom] = useState<string | null>(null);
    const [offered, setOffered] = useState<string | null>(null);
    const codeRef = useRef<Attached | null>(null);
    // An edit belongs to the file of the change it was made on: switching either keeps it there, and switching back brings it back.
    const editKey = unsavedEditKey(target.projectUuid, target.prUrl, path);
    // What was just saved is that file on that change, so it shows while the change is read again.
    const [justSaved, setJustSaved] = useState<{
        key: string;
        content: string;
        revision: string;
    } | null>(null);
    const saved = justSaved?.key === editKey ? justSaved : null;
    const loaded = file?.content ?? saved?.content ?? null;
    const sourceRevision = useRef<string | null>(null);
    // The revision is that of whatever is shown: the file once read, or what was just saved until then.
    if (text === null) {
        sourceRevision.current =
            file?.content != null
                ? file.revision
                : (saved?.revision ?? file?.revision ?? null);
    }
    // A save that lands while more was typed: its revision becomes the edit's base once the saved file is read back.
    const savedRevision = useRef<string | null>(null);
    if (
        savedRevision.current !== null &&
        file?.revision === savedRevision.current
    ) {
        sourceRevision.current = savedRevision.current;
        savedRevision.current = null;
    }
    const latestText = useRef(text);
    latestText.current = text;
    const value = text ?? loaded ?? '';
    const isDirty = text !== null && text !== loaded;
    const { track } = useTracking();
    // The files tracked so far, so a first edit counts once per file until it is saved or dropped.
    const trackedEdits = useRef(new Set<string>());
    // The text the editor was last mounted with, so a remount keeps what is typed.
    const mounted = useRef<{
        key: string;
        text: string | null;
        stateKey: string;
        path: string | null;
        revision: number;
    } | null>(null);
    const generations = useRef(new Map<string, number>());
    // Where the caret and scroll were before a remount of the same text, put back once the new editor attaches.
    const restoreView = useRef<{
        state: ReturnType<Attached['getViewState']>;
        focused: boolean;
    } | null>(null);
    const pane = useRef<HTMLDivElement>(null);
    // A view restore queued for the next frame skips an editor that has gone since.
    useEffect(
        () => () => {
            codeRef.current = null;
        },
        [],
    );
    const [history, setHistory] = useState({ canUndo: false, canRedo: false });
    const [isComparingProposal, setIsComparingProposal] = useState(false);
    // A save from Published moves the file to its new change, so the save's notice follows it there.
    const carriedNotice = useRef<{ key: string; notice: Notice } | null>(null);
    // A proposal shown in the editor is the agent's until the person types over it.
    const hasOwnEdits = isDirty && text !== offered;
    const isBeingSaved = isSaving && isDirty && !hasOwnEdits;
    const open = useRef({ key: editKey, path });
    open.current = { key: editKey, path };
    // Null at first, so coming back to Sources brings back what was left unsaved.
    const shownKey = useRef<string | null>(null);
    useEffect(() => {
        if (shownKey.current === editKey) {
            if (hasOwnEdits && text !== null)
                keepUnsaved(editKey, text, sourceRevision.current);
            else dropUnsaved(editKey);
            return;
        }
        shownKey.current = editKey;
        const kept = findUnsaved(editKey);
        setText(kept?.text ?? null);
        if (kept) sourceRevision.current = kept.revision;
        setNotice(
            carriedNotice.current?.key === editKey
                ? carriedNotice.current.notice
                : null,
        );
        carriedNotice.current = null;
        setProposedFrom(null);
        setOffered(null);
        setRevision((current) => current + 1);
    }, [editKey, hasOwnEdits, text]);
    const linted = useDeferredValue(value);
    const markers = useMemo(
        () =>
            path && isDbtPropertiesFile(path)
                ? lintDbtYaml(linted).map((problem) => ({
                      ...problem,
                      severity: 'error' as const,
                  }))
                : [],
        [path, linted],
    );
    const markersRef = useRef(markers);
    markersRef.current = markers;
    useEffect(() => {
        // A remounted editor drops its document before the new one attaches.
        if (codeRef.current?.getEditState())
            codeRef.current.setMarkers(markers);
    }, [markers]);
    const proposed = useMemo(
        () =>
            path && loaded !== null
                ? applyProposal(proposal, path, loaded)
                : null,
        [proposal, path, loaded],
    );
    // What the person's edits would replace: a pending proposal, or a newer version saved since they started.
    const pending =
        proposed !== null && proposed !== offered && hasOwnEdits
            ? proposed
            : null;
    const isBehind =
        hasOwnEdits &&
        file?.content != null &&
        sourceRevision.current !== null &&
        file.revision !== sourceRevision.current;
    const incoming = pending ?? (isBehind ? loaded : null);
    const proposalKey = useRef<string | null>(null);
    // Like an editor's agent: a proposal for the open file lands in it as an unsaved edit, once.
    useEffect(() => {
        // Just switched files: wait a render for its kept edits, which a proposal must not replace.
        if (proposalKey.current !== editKey) {
            proposalKey.current = editKey;
            return;
        }
        if (hasOwnEdits || proposed === offered) return;
        setOffered(proposed);
        setProposedFrom(proposed === null ? null : loaded);
        setText(proposed);
        if (proposed !== null) setLayout('diff');
        setRevision((current) => current + 1);
    }, [proposed, offered, hasOwnEdits, loaded, editKey, revision]);
    const where = target.changeName ?? 'live';

    const reset = () => {
        setText(null);
        setProposedFrom(null);
        setRevision((current) => current + 1);
        trackedEdits.current.delete(editKey);
        setTypedAsCode(null);
    };
    const editContent = (
        contents: string,
        editor: { canUndo: boolean; canRedo: boolean },
    ) => {
        setHistory({ canUndo: editor.canUndo, canRedo: editor.canRedo });
        if (notice?.tone === 'info') setNotice(null);
        if (shownLayout === 'code' && typedAsCode !== editKey)
            setTypedAsCode(editKey);
        if (contents !== value && !trackedEdits.current.has(editKey)) {
            trackedEdits.current.add(editKey);
            track({
                name: EventName.SEMANTIC_STUDIO_EDIT_STARTED,
                properties: { projectId: target.projectUuid, kind: 'file' },
            });
        }
        setText(contents);
    };
    const submit = () => {
        if (!path || !isDirty || isBeingSaved || save.isLoading || !canEdit)
            return;
        // The save may land after another file is opened; it then leaves that file alone.
        const savedKey = editKey;
        const submitted = value;
        // On a draft the file stays editable while it saves; the first save from Published moves to a new draft, so it waits.
        const keepsTyping = target.prUrl !== null;
        if (keepsTyping) {
            setNotice({ tone: 'info', text: `Saving to ${where}…` });
        }
        const isStillOpen = () => open.current.key === savedKey;
        const named = (message: string) =>
            isStillOpen() ? message : `${fileName(path)}: ${message}`;
        save.mutate(
            {
                path,
                content: value,
                revision: savedRevision.current ?? sourceRevision.current,
                prUrl: target.prUrl,
                threadUuid: target.threadUuid,
                newChangeAgentUuid: target.newChangeAgentUuid,
            },
            {
                onSuccess: (result) => {
                    if (result.status === 'failed') {
                        setNotice({ tone: 'error', text: named(result.error) });
                        return;
                    }
                    setJustSaved({
                        key: unsavedEditKey(
                            target.projectUuid,
                            result.prUrl,
                            path,
                        ),
                        content: submitted,
                        revision: result.revision,
                    });
                    // Typed on while it saved: those edits stay in the editor, on top of what was just saved.
                    const typedOn =
                        keepsTyping &&
                        isStillOpen() &&
                        latestText.current !== null &&
                        latestText.current !== submitted;
                    if (typedOn) {
                        savedRevision.current = result.revision;
                        setNotice({
                            tone: 'info',
                            text: `Saved to ${where}. What you typed since is not saved yet.`,
                        });
                        onSaved(result.prUrl, result.thread);
                        return;
                    }
                    // Typed on, then another file opened: that typing waits under this file, now over what was just saved.
                    const kept = findUnsaved(savedKey);
                    if (
                        keepsTyping &&
                        !isStillOpen() &&
                        kept !== null &&
                        kept.text !== submitted
                    ) {
                        keepUnsaved(savedKey, kept.text, result.revision);
                        onSaved(result.prUrl, result.thread);
                        return;
                    }
                    dropUnsaved(savedKey);
                    // A save from live moves to its new change, and what is typed in another live file comes along.
                    const liveKey = unsavedEditKey(
                        target.projectUuid,
                        null,
                        open.current.path,
                    );
                    if (
                        target.prUrl === null &&
                        open.current.key === liveKey &&
                        !isStillOpen()
                    ) {
                        moveUnsaved(
                            open.current.key,
                            unsavedEditKey(
                                target.projectUuid,
                                result.prUrl,
                                open.current.path,
                            ),
                        );
                    }
                    if (isStillOpen()) {
                        reset();
                        const savedTo = target.prUrl
                            ? `Saved to ${where}.`
                            : 'Saved as a new draft.';
                        const notice: Notice = {
                            tone: 'info',
                            text: result.checked
                                ? savedTo
                                : `${savedTo} SQL is checked when dbt next builds the draft.`,
                        };
                        setNotice(notice);
                        carriedNotice.current = {
                            key: unsavedEditKey(
                                target.projectUuid,
                                result.prUrl,
                                path,
                            ),
                            notice,
                        };
                    }
                    onSaved(result.prUrl, result.thread);
                },
                onError: (error) =>
                    setNotice({
                        tone: 'error',
                        text: named(saveErrorText(error)),
                    }),
            },
        );
    };
    const addToChat = () => {
        const picked = readSelection(codeRef.current);
        if (!path || !picked) return false;
        onAddToChat({
            modelName: modelNameOfSourcePath(path),
            fieldName: null,
            modelLabel: fileName(path),
            fieldLabel: null,
            fieldKind: null,
            fieldType: null,
            code: { path, ...picked },
        });
        return true;
    };
    // Pierre keeps the first options it is given, so they read the latest through refs.
    const actions = useRef({ addToChat });
    actions.current = { addToChat };
    const codeBox = useRef<HTMLDivElement>(null);
    const [searchParams] = useSearchParams();
    const askedField = IS_STUDIO_PROTO ? searchParams.get(FIELD_PARAM) : null;
    const askedLine =
        askedField && loaded ? findFieldLine(loaded, askedField) : null;
    // The editor renders, attaches and grows after this does, so the line is brought to the middle until it stays there
    useEffect(() => {
        if (askedLine === null) return undefined;
        let tries = 0;
        let settled = 0;
        const timer = window.setInterval(() => {
            tries += 1;
            const box = codeBox.current;
            const target = box
                ?.querySelector('diffs-container')
                ?.shadowRoot?.querySelector(`[data-line="${askedLine}"]`);
            if (tries > 40 || settled > 2) window.clearInterval(timer);
            if (!box || !target) return;
            // Scrolled by hand: scrollIntoView also moves a wide line sideways
            const off =
                target.getBoundingClientRect().top -
                box.getBoundingClientRect().top -
                box.clientHeight / 2;
            box.scrollTop += off;
            if (Math.abs(off) > 4) return;
            settled += 1;
            if (settled !== 1) return;
            codeRef.current?.setSelections([
                {
                    start: { line: askedLine - 1, character: 0 },
                    end: {
                        line: askedLine - 1,
                        character: target.textContent?.length ?? 0,
                    },
                    direction: 'forward',
                },
            ]);
        }, 100);
        return () => window.clearInterval(timer);
    }, [askedLine, path]);
    const [fileOptions, diffOptions] = useMemo(() => {
        const attach = (code: Attached) => {
            codeRef.current = code;
            code.setMarkers(markersRef.current);
            // A file opened again resumes its undo history.
            setHistory({ canUndo: code.canUndo, canRedo: code.canRedo });
            const restore = restoreView.current;
            restoreView.current = null;
            if (restore)
                requestAnimationFrame(() => {
                    if (codeRef.current !== code) return;
                    if (restore.focused) code.focus();
                    code.setViewState(restore.state);
                });
        };
        const add = () => actions.current.addToChat();
        return [
            editorOptionsFor<'file'>(attach, add),
            editorOptionsFor<'file-diff'>(attach, add),
        ] as const;
    }, []);

    if (!path) {
        return (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
                Pick a file to read or edit it.
            </Text>
        );
    }
    // An unread file is not shown as an empty one, which could be typed in and saved over it.
    if (readError && loaded === null && text === null) {
        return (
            <Stack align="center" gap="xs" py="xl">
                <Text fz="sm" c="dimmed">
                    {readError.error.message}
                </Text>
                <Button
                    size="xs"
                    variant="default"
                    onClick={() => void refetch()}
                >
                    Try again
                </Button>
            </Stack>
        );
    }
    const compare = isChangedFile
        ? canEdit
            ? (live?.content ?? null)
            : before
        : proposedFrom;
    const shownLayout =
        compare !== null && typedAsCode !== editKey ? layout : 'code';
    const pickLayout = (next: Layout) => {
        setTypedAsCode(null);
        setLayout(next);
    };
    const options = {
        ...pierreThemeFor(colorScheme),
        overflow: 'scroll',
        disableFileHeader: true,
    } as const;
    // Prototype: arriving from a field, its lines are marked; the caret is remembered for the way back
    const notePlace = (clicked: number | null) => {
        if (!IS_STUDIO_PROTO) return;
        const caret =
            codeRef.current?.getViewState().selections?.[0]?.start.line;
        const line = clicked ?? (caret === undefined ? null : caret + 1);
        if (line !== null) protoPlace.caret = { path, text: value, line };
    };
    // Pierre takes `edit` when it mounts, so a lock or unlock mounts it again.
    // A file read after it opened mounts again, so its retained document starts from the read text.
    const surfaceKey = `${path}:${shownLayout}:${revision}:${canEdit}:${loaded !== null}`;
    // Any remount (layout, a late comparison, a lock) restarts from what is typed so far.
    if (mounted.current?.key !== surfaceKey) {
        const previous = mounted.current;
        // Same file and text (a layout switch or a lock), so the caret and scroll stay where they were.
        // A read-only editor never attaches, so a view kept at a lock waits for the unlock.
        restoreView.current =
            previous?.path !== path || previous.revision !== revision
                ? null
                : codeRef.current
                  ? {
                        state: codeRef.current.getViewState(),
                        focused:
                            pane.current?.contains(document.activeElement) ??
                            false,
                    }
                  : restoreView.current;
        codeRef.current = null;
        // On the render that switches files, `text` is still the last file's.
        const mountedText =
            shownKey.current === editKey
                ? text
                : (findUnsaved(editKey)?.text ?? null);
        const contents = mountedText ?? loaded ?? '';
        // Pierre keeps each file's document and undo history under this key; a different text starts a new one.
        let generation = generations.current.get(editKey) ?? 0;
        const retained = EditStateManager.get(
            shownLayout === 'code' ? 'file' : 'file-diff',
            `${editKey}:${generation}`,
        );
        if (retained && retained.document.getText() !== contents) {
            generation += 1;
            generations.current.set(editKey, generation);
        }
        mounted.current = {
            key: surfaceKey,
            text: mountedText,
            stateKey: `${editKey}:${generation}`,
            path,
            revision,
        };
    }
    const current = {
        name: fileName(path),
        contents: mounted.current.text ?? loaded ?? '',
    };
    const dir = path.split('/').slice(0, -1).join('/');
    const status = !change
        ? null
        : change.isProposed
          ? { label: isSaving ? 'Saving' : 'Proposed', color: 'violet' }
          : change.isNew
            ? { label: 'Added', color: 'green' }
            : // The line counts already say a file changed.
              null;
    // Like a pull request's compare: what the diff starts from, and what it shows.
    const comparison = `${!canEdit ? 'Before' : isChangedFile || !target.prUrl ? 'Published' : 'This draft'} → ${
        proposedFrom !== null && !hasOwnEdits
            ? isSaving
                ? 'Being saved'
                : 'Proposal'
            : isDirty
              ? 'Unsaved'
              : 'This change'
    }`;
    const check = (isOn: boolean) =>
        isOn ? <MantineIcon icon={IconCheck} size={14} /> : null;
    return (
        <Box className={tabClasses.codePane} ref={pane}>
            <Group
                className={tabClasses.codeToolbar}
                justify="space-between"
                wrap="nowrap"
                gap="sm"
            >
                <Group gap={8} wrap="nowrap" miw={0}>
                    {status ? (
                        <Badge
                            size="sm"
                            radius="sm"
                            variant="light"
                            color={status.color}
                            tt="none"
                            fw={500}
                            flex="none"
                        >
                            {status.label}
                        </Badge>
                    ) : null}
                    <Text fz="sm" truncate title={path} miw={0}>
                        {dir ? (
                            <Text span inherit c="dimmed">
                                {dir}/
                            </Text>
                        ) : null}
                        <Text span inherit fw={500}>
                            {fileName(path)}
                        </Text>
                    </Text>
                    {change ? (
                        <Text
                            fz="xs"
                            flex="none"
                            className={classes.sourceCounts}
                        >
                            <Text span inherit c="green.7">
                                +{change.additions}
                            </Text>{' '}
                            <Text span inherit c="red.7">
                                −{change.deletions}
                            </Text>
                        </Text>
                    ) : null}
                    {markers.length > 0 ? (
                        <Tooltip label={markers[0].message} multiline maw={320}>
                            <Text fz="xs" c="red.7" flex="none">
                                {markers.length === 1
                                    ? '1 problem'
                                    : `${markers.length} problems`}
                            </Text>
                        </Tooltip>
                    ) : null}
                    {isDirty && !isBeingSaved ? (
                        <Tooltip label="Not saved">
                            <Box
                                className={classes.unsavedDot}
                                aria-label="Not saved"
                            />
                        </Tooltip>
                    ) : null}
                </Group>
                <Group gap="xs" wrap="nowrap" flex="none">
                    {!canEdit ? (
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
                                title={target.readOnlyReason ?? undefined}
                            >
                                {target.readOnlyReason ?? 'Read only'}
                            </Text>
                        </Group>
                    ) : null}
                    {isFetching && !isDirty ? (
                        <Loader size={12} color="gray" />
                    ) : null}
                    {compare !== null ? (
                        <Menu position="bottom-end" width={240}>
                            <Tooltip
                                label={
                                    shownLayout === 'code'
                                        ? 'Not comparing'
                                        : comparison
                                }
                            >
                                <Menu.Target>
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        color="gray"
                                        aria-label={`Compare: ${
                                            shownLayout === 'code'
                                                ? 'Not comparing'
                                                : comparison
                                        }`}
                                    >
                                        <MantineIcon
                                            icon={IconGitCompare}
                                            size={14}
                                        />
                                    </ActionIcon>
                                </Menu.Target>
                            </Tooltip>
                            <Menu.Dropdown>
                                <Menu.Label>Compare</Menu.Label>
                                <Menu.Item
                                    rightSection={check(shownLayout !== 'code')}
                                    onClick={() =>
                                        shownLayout === 'code' &&
                                        pickLayout('diff')
                                    }
                                >
                                    {comparison}
                                </Menu.Item>
                                <Menu.Item
                                    rightSection={check(shownLayout === 'code')}
                                    onClick={() => pickLayout('code')}
                                >
                                    Just the file
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Label>Layout</Menu.Label>
                                <Menu.Item
                                    disabled={shownLayout === 'code'}
                                    rightSection={check(shownLayout === 'diff')}
                                    onClick={() => pickLayout('diff')}
                                >
                                    Unified
                                </Menu.Item>
                                <Menu.Item
                                    disabled={shownLayout === 'code'}
                                    rightSection={check(
                                        shownLayout === 'split',
                                    )}
                                    onClick={() => pickLayout('split')}
                                >
                                    Side by side
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    ) : null}
                    {canEdit ? (
                        <>
                            <Tooltip label={`Undo (${MOD_KEY}Z)`}>
                                <ActionIcon
                                    aria-label="Undo"
                                    className={tabClasses.history}
                                    disabled={!history.canUndo}
                                    onClick={() => codeRef.current?.undo()}
                                >
                                    <MantineIcon icon={IconArrowBackUp} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={`Redo (${REDO_KEYS})`}>
                                <ActionIcon
                                    aria-label="Redo"
                                    className={tabClasses.history}
                                    disabled={!history.canRedo}
                                    onClick={() => codeRef.current?.redo()}
                                >
                                    <MantineIcon icon={IconArrowForwardUp} />
                                </ActionIcon>
                            </Tooltip>
                        </>
                    ) : null}
                    {isDirty && !isBeingSaved ? (
                        <>
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                disabled={save.isLoading}
                                onClick={() => {
                                    setNotice(null);
                                    // Your own edits go back as an edit, so undo brings them back; a proposal is set aside.
                                    if (offered === null && codeRef.current)
                                        replaceText(
                                            codeRef.current,
                                            loaded ?? '',
                                        );
                                    else reset();
                                }}
                            >
                                Discard
                            </Button>
                            <Tooltip
                                label={
                                    <Group gap={6} wrap="nowrap">
                                        {target.prUrl
                                            ? `Commits to ${where}`
                                            : 'Opens a pull request'}
                                        <Kbd size="xs">{`${MOD_KEY}S`}</Kbd>
                                    </Group>
                                }
                            >
                                <Button
                                    size="compact-xs"
                                    loading={save.isLoading}
                                    disabled={!canEdit}
                                    onClick={submit}
                                >
                                    {target.prUrl
                                        ? 'Save'
                                        : 'Save as a new draft'}
                                </Button>
                            </Tooltip>
                        </>
                    ) : null}
                    <CopyActionIcon value={value} copyLabel="Copy" />
                </Group>
            </Group>
            {incoming !== null ? (
                <Alert color="violet" radius={0} py={8}>
                    <Group gap="xs" justify="space-between" wrap="nowrap">
                        <Text fz="xs">
                            {pending === null
                                ? 'This file changed since you started editing. Your edits are kept here.'
                                : isSaving
                                  ? 'The agent is saving a change to this file. Your edits are kept here.'
                                  : 'The agent proposed a change to this file. Your edits are kept here.'}
                        </Text>
                        <Button
                            size="compact-xs"
                            variant="default"
                            flex="none"
                            onClick={() => setIsComparingProposal(true)}
                        >
                            Compare
                        </Button>
                    </Group>
                </Alert>
            ) : null}
            <MantineModal
                opened={isComparingProposal && incoming !== null}
                onClose={() => setIsComparingProposal(false)}
                onCancel={() => {
                    setIsComparingProposal(false);
                    // Kept over a newer version, the edits save over it.
                    if (pending === null && file?.content != null && text) {
                        sourceRevision.current = file.revision;
                        keepUnsaved(editKey, text, file.revision);
                    }
                }}
                title={
                    pending === null
                        ? 'Your edits → the latest version'
                        : "Your edits → the agent's proposal"
                }
                size="xl"
                cancelLabel="Keep my edits"
                confirmLabel={
                    pending === null
                        ? 'Use the latest version'
                        : 'Use the proposal'
                }
                onConfirm={() => {
                    setIsComparingProposal(false);
                    reset();
                    setNotice(null);
                }}
            >
                {incoming !== null ? (
                    <WorkerPoolContextProvider
                        poolOptions={PIERRE_POOL_OPTIONS}
                        highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                    >
                        <MultiFileDiff
                            oldFile={{ name: fileName(path), contents: value }}
                            newFile={{
                                name: fileName(path),
                                contents: incoming,
                            }}
                            options={{
                                ...options,
                                diffStyle: 'unified',
                                diffIndicators: 'bars',
                                lineDiffType: 'word',
                            }}
                        />
                    </WorkerPoolContextProvider>
                ) : null}
            </MantineModal>
            {notice ? (
                <Alert
                    color={notice.tone === 'error' ? 'red' : 'blue'}
                    radius={0}
                    py={8}
                    classNames={{ wrapper: classes.noticeRow }}
                    withCloseButton
                    onClose={() => setNotice(null)}
                >
                    <Text fz="xs" className={classes.sourceNotice}>
                        {notice.text}
                    </Text>
                </Alert>
            ) : null}
            <Box
                ref={codeBox}
                className={classes.sourceCode}
                onKeyUp={() => notePlace(null)}
                onMouseUp={(event) =>
                    notePlace(
                        pointInCode(event.nativeEvent)?.lineNumber ?? null,
                    )
                }
                onKeyDownCapture={(event) => {
                    leaveOnEscape(event.nativeEvent, codeRef.current);
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
                {file && file.content === null ? (
                    <Text fz="sm" c="dimmed" p="md">
                        This file is not on {where}.
                    </Text>
                ) : file ? (
                    <WorkerPoolContextProvider
                        poolOptions={PIERRE_POOL_OPTIONS}
                        highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                    >
                        <EditProvider createEditor={createEditor}>
                            {shownLayout === 'code' ? (
                                <File
                                    key={surfaceKey}
                                    editStateKey={mounted.current.stateKey}
                                    className={classes.sourceHost}
                                    file={current}
                                    options={options}
                                    edit={
                                        canEdit &&
                                        (!save.isLoading ||
                                            target.prUrl !== null) &&
                                        !isBeingSaved
                                    }
                                    editorOptions={fileOptions}
                                    onEditChange={(event) =>
                                        editContent(
                                            event.file.contents,
                                            event.editor,
                                        )
                                    }
                                    onEditComplete={() => 'accept'}
                                />
                            ) : (
                                <MultiFileDiff
                                    key={surfaceKey}
                                    editStateKey={mounted.current.stateKey}
                                    className={classes.sourceHost}
                                    oldFile={{
                                        name: fileName(path),
                                        contents: compare ?? '',
                                    }}
                                    newFile={current}
                                    options={{
                                        ...options,
                                        diffStyle:
                                            shownLayout === 'split'
                                                ? 'split'
                                                : 'unified',
                                        diffIndicators: 'bars',
                                        lineDiffType: 'word',
                                    }}
                                    edit={
                                        canEdit &&
                                        (!save.isLoading ||
                                            target.prUrl !== null) &&
                                        !isBeingSaved
                                    }
                                    editorOptions={diffOptions}
                                    onEditChange={(event) =>
                                        editContent(
                                            event.file.contents,
                                            event.editor,
                                        )
                                    }
                                    onEditComplete={() => 'accept'}
                                />
                            )}
                        </EditProvider>
                    </WorkerPoolContextProvider>
                ) : null}
            </Box>
        </Box>
    );
};
