/** Sources: the project's YAML and SQL as code, like an IDE: edit, see what the change does, ask the agent. */
import { lintDbtYaml, type ApiError } from '@lightdash/common';
import {
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
    Editor as CodeEditor,
    type EditorFactory,
    type EditorOptions,
    type EditorType,
} from '@pierre/diffs/edit';
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
    IconChevronDown,
    IconGitCompare,
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
} from 'react';
import { useSearchParams } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import { splitPatchIntoFiles } from '../../ee/features/aiCopilot/components/ChatElements/ToolCalls/splitPatch';
import { type StoredThread } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
import { useWholePullRequestDiff } from '../../ee/features/aiCopilot/hooks/usePullRequestDiff';
import tabClasses from './ModelTabs.module.css';
import { applyProposal, fileBefore, proposedPathOf } from './proposedFile';
import { type StudioChatCode, type StudioChatRef } from './studioChatRefs';
import {
    SOURCE_PARAM,
    useSaveStudioSource,
    useStudioSourceFile,
    useStudioSources,
} from './useStudioSources';
import classes from './WorkbenchView.module.css';

// ponytail: unsaved edits live for the tab only; leaving the page warns while any are kept.
const unsavedEdits = new Map<string, string>();
let warnsOnLeave = false;
const keepUnsaved = (key: string, text: string) => {
    unsavedEdits.set(key, text);
    if (warnsOnLeave) return;
    warnsOnLeave = true;
    window.addEventListener('beforeunload', (event) => {
        if (unsavedEdits.size > 0) event.preventDefault();
    });
};

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
    /** On a change, nothing open is its overview, listed first. */
    hasOverview: boolean;
}> = ({ target, proposal, hasOverview }) => {
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
        <Box className={classes.rail}>
            <Box className={classes.railHeader}>
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
                                    ? 'proposed'
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

type Point = { line: number; character: number };

const offsetOf = (lines: string[], at: Point) =>
    lines
        .slice(0, at.line)
        .reduce((total, line) => total + line.length + 1, at.character);

type Attached = Pick<
    CodeEditor,
    'getText' | 'getViewState' | 'getEditState' | 'setMarkers'
>;

/** The selected lines and text, from Pierre's zero-based selection. */
const readSelection = (
    code: Attached | null,
): Omit<StudioChatCode, 'path'> | null => {
    const range = code?.getViewState().selections?.[0];
    if (!code || !range) return null;
    const lines = code.getText().split('\n');
    const text = code
        .getText()
        .slice(offsetOf(lines, range.start), offsetOf(lines, range.end));
    if (!text.trim()) return null;
    return { from: range.start.line + 1, to: range.end.line + 1, text };
};

/** Pierre draws in a shadow root, so the chip is plain DOM styled with Mantine's variables. */
const createChip = (onClick: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    const shortcut = document.createElement('span');
    shortcut.textContent = '⌘L';
    shortcut.style.opacity = '0.6';
    button.append('Add to chat', shortcut);
    // Black on light, inverted on dark so it still stands out.
    Object.assign(button.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        font: '600 13px var(--mantine-font-family)',
        padding: '6px 12px',
        cursor: 'pointer',
        color: 'light-dark(var(--mantine-color-white), var(--mantine-color-black))',
        background:
            'light-dark(var(--mantine-color-black), var(--mantine-color-white))',
        border: 'none',
        borderRadius: 'var(--mantine-radius-md)',
        boxShadow: 'var(--mantine-shadow-md)',
    });
    // Keeps the selection: a mousedown here would move the caret.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', onClick);
    return button;
};

type Layout = 'code' | 'diff' | 'split';

const createEditor: EditorFactory<undefined, undefined> = (
    type,
    options,
    key,
) => new CodeEditor(type, options, key);

const editorOptionsFor = <T extends EditorType>(
    onAttach: (code: Attached) => void,
    onAddToChat: () => void,
): EditorOptions<T, undefined, undefined> => ({
    enabledSelectionAction: true,
    renderSelectionAction: (context) =>
        createChip(() => {
            onAddToChat();
            context.close();
        }),
    onAttach,
});

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
}> = ({ target, onSaved, onAddToChat, proposal }) => {
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
    const editKey = `${target.projectUuid}\n${target.prUrl ?? ''}\n${path ?? ''}`;
    // What was just saved is that file on that change, so it shows while the change is read again.
    const [justSaved, setJustSaved] = useState<{
        key: string;
        content: string;
    } | null>(null);
    const loaded =
        file?.content ??
        (justSaved?.key === editKey ? justSaved.content : null);
    const value = text ?? loaded ?? '';
    const isDirty = text !== null && text !== loaded;
    // A proposal shown in the editor is the agent's until the person types over it.
    const hasOwnEdits = isDirty && text !== offered;
    const openKey = useRef(editKey);
    openKey.current = editKey;
    // Null at first, so coming back to Sources brings back what was left unsaved.
    const shownKey = useRef<string | null>(null);
    useEffect(() => {
        if (shownKey.current === editKey) {
            if (hasOwnEdits && text !== null) keepUnsaved(editKey, text);
            else unsavedEdits.delete(editKey);
            return;
        }
        shownKey.current = editKey;
        const kept = unsavedEdits.get(editKey) ?? null;
        setBase(kept);
        setText(kept);
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
        if (!path || !isDirty || save.isLoading || !target.canEdit) return;
        // The save may land after another file is opened; it then leaves that file alone.
        const savedKey = editKey;
        const isStillOpen = () => openKey.current === savedKey;
        const named = (message: string) =>
            isStillOpen() ? message : `${fileName(path)}: ${message}`;
        save.mutate(
            {
                path,
                content: value,
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
                        key: `${target.projectUuid}\n${result.prUrl}\n${path}`,
                        content: value,
                    });
                    unsavedEdits.delete(savedKey);
                    if (isStillOpen()) {
                        reset();
                        setNotice(
                            result.checked
                                ? null
                                : {
                                      tone: 'info',
                                      text: 'Saved. SQL is checked when dbt next builds the change.',
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
    if (readError && loaded === null) {
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
        theme: colorScheme === 'dark' ? 'pierre-dark' : 'pierre-light',
        overflow: 'scroll',
        disableFileHeader: true,
    } as const;
    const current = { name: fileName(path), contents: base ?? loaded ?? '' };
    const dir = path.split('/').slice(0, -1).join('/');
    const status = !change
        ? null
        : change.isProposed
          ? { label: 'Proposed', color: 'violet' }
          : change.isNew
            ? { label: 'Added', color: 'green' }
            : { label: 'Modified', color: 'yellow' };
    // Like a pull request's compare: what the diff starts from, and what it shows.
    const comparison = `${!target.canEdit ? 'Before' : isChangedFile || !target.prUrl ? 'Live' : 'This change'} → ${
        proposedFrom !== null ? 'Proposal' : isDirty ? 'Unsaved' : 'This change'
    }`;
    const check = (isOn: boolean) =>
        isOn ? <MantineIcon icon={IconCheck} size={14} /> : null;
    const surfaceKey = `${path}:${shownLayout}:${revision}`;
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
                    {isDirty ? (
                        <Tooltip label="Not saved">
                            <Box
                                className={classes.unsavedDot}
                                aria-label="Not saved"
                            />
                        </Tooltip>
                    ) : null}
                </Group>
                <Group gap="xs" wrap="nowrap" flex="none">
                    {target.canEdit ? null : (
                        <Text fz="xs" c="dimmed">
                            Read only
                        </Text>
                    )}
                    {isFetching && !isDirty ? (
                        <Loader size={12} color="gray" />
                    ) : null}
                    {compare !== null ? (
                        <Menu position="bottom-end" width={240}>
                            <Menu.Target>
                                <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    color="gray"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconGitCompare}
                                            size={14}
                                        />
                                    }
                                    rightSection={
                                        <MantineIcon
                                            icon={IconChevronDown}
                                            size={12}
                                        />
                                    }
                                >
                                    {shownLayout === 'code'
                                        ? 'Not comparing'
                                        : comparison}
                                </Button>
                            </Menu.Target>
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
                    {isDirty ? (
                        <>
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                disabled={save.isLoading}
                                onClick={() => {
                                    reset();
                                    setNotice(null);
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
                                        : 'Save as a new change'}
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
                        The agent proposed a change to this file. Discard your
                        edits to see it here.
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
                                    edit={target.canEdit && !save.isLoading}
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
                                    edit={target.canEdit && !save.isLoading}
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
