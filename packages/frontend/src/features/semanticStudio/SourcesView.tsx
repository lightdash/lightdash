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
import {
    EditProvider,
    File,
    MultiFileDiff,
    WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import { type FileTreeIconConfig } from '@pierre/trees';
import { FileTree, useFileTree } from '@pierre/trees/react';
import {
    IconCheck,
    IconGitCompare,
    IconLock,
    IconListDetails,
    IconPencil,
    IconSearch,
} from '@tabler/icons-react';
import {
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useSearchParams } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import tabClasses from './ModelTabs.module.css';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
    pierreThemeFor,
} from './pierreDiffConfig';
import {
    createEditor,
    editorOptionsFor,
    readSelection,
    type Attached,
} from './pierreEditor';
import { applyProposal, fileBefore, proposedPathOf } from './proposedFile';
import classes from './SourcesView.module.css';
import { splitPatchIntoFiles } from './splitPatch';
import { type StoredThread } from './studioChange';
import { type StudioChatRef } from './studioChatRefs';
import { keepUnsaved, unsavedEditKey, unsavedEdits } from './unsavedEdits';
import { useWholePullRequestDiff } from './usePullRequestDiff';
import {
    SOURCE_PARAM,
    useSaveStudioSource,
    useStudioSourceFile,
    useStudioSources,
} from './useStudioSources';
import workbenchClasses from './WorkbenchView.module.css';

/** Where the code view reads from and saves to: a change's pull request, or live. */
export type SourcesTarget = {
    projectUuid: string;
    prUrl: string | null;
    /** The change's latest commit, so a save by the agent shows up here. */
    head: string | null;
    threadUuid: string | null;
    /** On live, the agent a save's new change talks to. */
    newChangeAgentUuid: string | null;
    /** What the change is called, or null on live. */
    changeName: string | null;
    /** False on someone else's change or one that is merged or closed: it is read, not edited. */
    canEdit: boolean;
    /** Why it is read and not edited, as a sentence; null when it can be edited. */
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

const countLines = (patch: string, sign: '+' | '-') =>
    patch
        .split('\n')
        .filter(
            (line) => line.startsWith(sign) && !line.startsWith(sign.repeat(3)),
        ).length;

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
                      ({ path, patch, additions, deletions }) => ({
                          // The diff is by repository path; files are by project path.
                          path:
                              files.find(
                                  (file) =>
                                      path === file ||
                                      path.endsWith(`/${file}`),
                              ) ?? path,
                          additions,
                          deletions,
                          isNew: patch.includes('\nnew file mode'),
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
                const path = proposedPathOf(code);
                return path && !changed.some((change) => change.path === path)
                    ? [
                          {
                              path,
                              additions: countLines(code, '+'),
                              deletions: countLines(code, '-'),
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
    const latest = useRef({ open, selected, files: fileSet });
    latest.current = { open, selected, files: fileSet };
    const { model } = useFileTree({
        paths: [],
        icons: SOURCE_ICONS,
        fileTreeSearchMode: 'hide-non-matches',
        density: 'compact',
        // Like an editor's explorer: folders closed except the way to the open file.
        initialExpansion: 'closed',
        initialExpandedPaths: ancestorsOf(selected),
        flattenEmptyDirectories: true,
        initialSelectedPaths: selected ? [selected] : [],
        onSelectionChange: ([path]) => {
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
        if (!selected || !fileSet.has(selected) || shown.includes(selected))
            return;
        shown.forEach((path) => model.getItem(path)?.deselect());
        model.getItem(selected)?.select();
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
    const [search, setSearch] = useState('');
    return (
        <Box className={workbenchClasses.rail}>
            <Box className={workbenchClasses.railHeader}>
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
export const SourcePane: FC<{
    target: SourcesTarget;
    onSaved: (prUrl: string, thread: StoredThread | null) => void;
    onAddToChat: (ref: StudioChatRef) => void;
    proposal: string[];
    /** The proposal is a save of the agent's that is running, so it is shown and not saved again. */
    isSaving: boolean;
}> = ({ target, onSaved, onAddToChat, proposal, isSaving }) => {
    const colorScheme = useComputedColorScheme('light');
    const [path] = useOpenFile();
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
        isChangedFile && target.canEdit ? path : null,
    );
    // A change you only read is shown against itself, since live may have moved on since.
    const before =
        !target.canEdit && change && path && file?.content
            ? change.isNew
                ? ''
                : fileBefore(change.patch, path, file.content)
            : null;
    const save = useSaveStudioSource(target.projectUuid);
    const [layout, setLayout] = useState<Layout>('diff');
    // Pierre owns the document while editing: it starts from `base` and reports each change into `text`.
    const [base, setBase] = useState<string | null>(null);
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
    const value = text ?? loaded ?? '';
    const isDirty = text !== null && text !== loaded;
    // Code is read until the person asks to edit it; unsaved text keeps it in editing.
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const { track } = useTracking();
    const isEditing = target.canEdit && (isDirty || editingKey === editKey);
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
            else unsavedEdits.delete(editKey);
            return;
        }
        shownKey.current = editKey;
        const kept = unsavedEdits.get(editKey) ?? null;
        setBase(kept?.text ?? null);
        setText(kept?.text ?? null);
        if (kept) sourceRevision.current = kept.revision;
        setNotice(null);
        setProposedFrom(null);
        setOffered(null);
        setRevision((current) => current + 1);
    }, [editKey, hasOwnEdits, text]);
    const linted = useDeferredValue(value);
    const markers = useMemo(
        () =>
            path && /\.ya?ml$/.test(path)
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
    // Like an editor's agent: a proposal for the open file lands in it as an unsaved edit, once.
    useEffect(() => {
        if (hasOwnEdits || proposed === offered) return;
        setOffered(proposed);
        setProposedFrom(proposed === null ? null : loaded);
        setBase(proposed);
        setText(proposed);
        if (proposed !== null) setLayout('diff');
        setRevision((current) => current + 1);
    }, [proposed, offered, hasOwnEdits, loaded]);
    const where = target.changeName ?? 'live';

    const reset = () => {
        setBase(null);
        setText(null);
        setProposedFrom(null);
        setRevision((current) => current + 1);
    };
    const submit = () => {
        if (
            !path ||
            !isDirty ||
            isBeingSaved ||
            save.isLoading ||
            !target.canEdit
        )
            return;
        // The save may land after another file is opened; it then leaves that file alone.
        const savedKey = editKey;
        const isStillOpen = () => open.current.key === savedKey;
        const named = (message: string) =>
            isStillOpen() ? message : `${fileName(path)}: ${message}`;
        save.mutate(
            {
                path,
                content: value,
                revision: sourceRevision.current,
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
                        content: value,
                        revision: result.revision,
                    });
                    unsavedEdits.delete(savedKey);
                    // A save from live moves to its new change, and what is typed in another live file comes along.
                    const liveKey = unsavedEditKey(
                        target.projectUuid,
                        null,
                        open.current.path,
                    );
                    const typed = unsavedEdits.get(open.current.key);
                    if (
                        target.prUrl === null &&
                        open.current.key === liveKey &&
                        !isStillOpen() &&
                        typed !== undefined
                    ) {
                        unsavedEdits.delete(open.current.key);
                        keepUnsaved(
                            unsavedEditKey(
                                target.projectUuid,
                                result.prUrl,
                                open.current.path,
                            ),
                            typed.text,
                            typed.revision,
                        );
                    }
                    if (isStillOpen()) {
                        reset();
                        setNotice(
                            result.checked
                                ? null
                                : {
                                      tone: 'info',
                                      text: 'Saved. SQL is checked when dbt next builds the draft.',
                                  },
                        );
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
        if (!path || !picked) return;
        onAddToChat({
            modelName: fileName(path).replace(/\.(ya?ml|sql)$/, ''),
            fieldName: null,
            modelLabel: fileName(path),
            fieldLabel: null,
            fieldKind: null,
            fieldType: null,
            code: { path, ...picked },
        });
    };
    // Pierre keeps the first options it is given, so they read the latest through refs.
    const actions = useRef({ addToChat });
    actions.current = { addToChat };
    const [fileOptions, diffOptions] = useMemo(() => {
        const attach = (code: Attached) => {
            codeRef.current = code;
            code.setMarkers(markersRef.current);
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
        ? target.canEdit
            ? (live?.content ?? null)
            : before
        : proposedFrom;
    const shownLayout = compare !== null ? layout : 'code';
    // Switching layout remounts Pierre, so it restarts from what is typed so far.
    const pickLayout = (next: Layout) => {
        setBase(value);
        setLayout(next);
    };
    const options = {
        ...pierreThemeFor(colorScheme),
        overflow: 'scroll',
        disableFileHeader: true,
    } as const;
    const current = { name: fileName(path), contents: base ?? loaded ?? '' };
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
    const comparison = `${!target.canEdit ? 'Before' : isChangedFile || !target.prUrl ? 'Published' : 'This draft'} → ${
        proposedFrom !== null
            ? isSaving
                ? 'Being saved'
                : 'Proposal'
            : isDirty
              ? 'Unsaved'
              : 'This change'
    }`;
    const check = (isOn: boolean) =>
        isOn ? <MantineIcon icon={IconCheck} size={14} /> : null;
    // Pierre takes `edit` when it mounts, so entering or leaving editing mounts it again.
    const surfaceKey = `${path}:${shownLayout}:${revision}:${isEditing}`;
    return (
        <Box className={tabClasses.codePane}>
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
                    {!target.canEdit ? (
                        <Tooltip
                            label={target.readOnlyReason ?? 'Read only'}
                            multiline
                            maw={280}
                        >
                            <Box
                                className={classes.readOnly}
                                aria-label={
                                    target.readOnlyReason ?? 'Read only'
                                }
                            >
                                <MantineIcon
                                    icon={IconLock}
                                    size={14}
                                    color="dimmed"
                                />
                            </Box>
                        </Tooltip>
                    ) : isEditing ? null : (
                        <Tooltip
                            label={
                                target.prUrl
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
                                            projectId: target.projectUuid,
                                            kind: 'file',
                                        },
                                    });
                                    setEditingKey(editKey);
                                }}
                            >
                                Edit
                            </Button>
                        </Tooltip>
                    )}
                    {isEditing && !isDirty ? (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => setEditingKey(null)}
                        >
                            Done
                        </Button>
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
                    {isDirty && !isBeingSaved ? (
                        <>
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                disabled={save.isLoading}
                                onClick={() => {
                                    reset();
                                    setNotice(null);
                                    setEditingKey(null);
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
                                        <Kbd size="xs">⌘S</Kbd>
                                    </Group>
                                }
                            >
                                <Button
                                    size="compact-xs"
                                    loading={save.isLoading}
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
            {proposed && proposed !== offered && hasOwnEdits ? (
                <Alert color="violet" radius={0} py={8}>
                    <Text fz="xs">
                        {isSaving
                            ? 'The agent is saving a change to this file. Discard your edits to see it here.'
                            : 'The agent proposed a change to this file. Discard your edits to see it here.'}
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
                    <Text fz="xs" className={classes.sourceNotice}>
                        {notice.text}
                    </Text>
                </Alert>
            ) : null}
            <Box
                className={classes.sourceCode}
                onKeyDownCapture={(event) => {
                    if (!(event.metaKey || event.ctrlKey)) return;
                    const key = event.key.toLowerCase();
                    if (key === 's') {
                        event.preventDefault();
                        submit();
                    } else if (key === 'l') {
                        event.preventDefault();
                        addToChat();
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
                                    className={classes.sourceHost}
                                    file={current}
                                    options={options}
                                    edit={
                                        isEditing &&
                                        !save.isLoading &&
                                        !isBeingSaved
                                    }
                                    editorOptions={fileOptions}
                                    onEditChange={(event) =>
                                        setText(event.file.contents)
                                    }
                                    onEditComplete={() => 'accept'}
                                />
                            ) : (
                                <MultiFileDiff
                                    key={surfaceKey}
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
                                        isEditing &&
                                        !save.isLoading &&
                                        !isBeingSaved
                                    }
                                    editorOptions={diffOptions}
                                    onEditChange={(event) =>
                                        setText(event.file.contents)
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
