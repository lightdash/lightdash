import {
    describeLearnWorkspaceYamlError,
    validateLearnWorkspaceYaml,
    type ApiError,
    type LearnSandboxCommandRequest,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Center,
    Group,
    Loader,
    ScrollArea,
    Text,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link, Navigate } from 'react-router';
import InlineErrorState from '../../components/common/InlineErrorState';
import ResizableSplitter from '../../components/common/ResizableSplitter';
import useToaster from '../../hooks/toaster/useToaster';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import FileTree from './FileTree';
import { useCommandOutput } from './hooks/useCommandOutput';
import { useRunCommand } from './hooks/useRunCommand';
import { useSaveWorkspaceFile } from './hooks/useSaveWorkspaceFile';
import { useWorkspaceFile } from './hooks/useWorkspaceFile';
import { useWorkspaceFiles } from './hooks/useWorkspaceFiles';
// eslint-disable-next-line css-modules/no-unused-class -- classes shared across learnSandbox files
import styles from './LearnWorkspace.module.css';
import { activeCommandFromError, parseCommand } from './parseCommand';
import Terminal from './Terminal';
import { useWorkspaceAccess } from './useWorkspaceAccess';
import WorkspaceEditor from './WorkspaceEditor';

/**
 * The key both the explore list (`useExplores`) and a single explore
 * (`useExplore`) are cached under.
 */
const EXPLORE_QUERY_KEY = ['tables'];

type WorkspaceProps = {
    projectUuid: string;
    trainingProjectUuid: string;
};

/**
 * The three panes over the learner's own copy: files on the left, the YAML
 * editor over the terminal on the right. Edits live in `drafts` until they
 * are autosaved — on editor blur and before every run — so a command never
 * runs against a file the learner has changed on screen but not on disk.
 */
const Workspace: FC<WorkspaceProps> = ({
    projectUuid,
    trainingProjectUuid,
}) => {
    const { showToastApiError } = useToaster();
    const route = useOptionalProjectRoute();
    const queryClient = useQueryClient();

    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [commandInput, setCommandInput] = useState('');
    const [activeCommandUuid, setActiveCommandUuid] = useState<string | null>(
        null,
    );
    // What the attached command is, when this page is the one that started
    // it. Null for a command it merely attached to (the 409 path), which it
    // cannot name.
    const [activeCommand, setActiveCommand] =
        useState<LearnSandboxCommandRequest | null>(null);
    // A run is on its way: from the click, through the save it does first,
    // until the command is attached or the attempt has failed. A save the
    // learner never asked to run (the editor's blur autosave) is not this.
    const [isRunPending, setIsRunPending] = useState(false);
    // Errors the page itself raises (a rejected command, a command that never
    // left the browser); the poller's own errors arrive on `output.error`.
    const [terminalError, setTerminalError] = useState<string | null>(null);
    const pendingSaveRef = useRef<{
        path: string;
        content: string;
        promise: Promise<boolean>;
    } | null>(null);

    const {
        data: files,
        error: filesError,
        isError: isFilesError,
    } = useWorkspaceFiles(projectUuid);
    const {
        data: file,
        error: fileError,
        isError: isFileError,
    } = useWorkspaceFile(projectUuid, selectedPath);
    const saveFile = useSaveWorkspaceFile(projectUuid);
    const runCommand = useRunCommand(projectUuid);
    const output = useCommandOutput(projectUuid, activeCommandUuid);

    // `file` can still hold the previously selected path's data for one
    // render after `selectedPath` changes (react-query clears `data` once
    // the new query starts, but the old query's result can still be in
    // flight back to this hook); treat it as loaded only once it answers
    // for the path currently selected, so the editor never shows one file's
    // path or content over another's.
    const loadedFile = file && file.path === selectedPath ? file : undefined;
    // What the drafts are now, for a save that resolves renders later.
    const draftsRef = useRef(drafts);
    draftsRef.current = drafts;
    const draft = selectedPath === null ? undefined : drafts[selectedPath];
    const isDirty = draft !== undefined && draft !== loadedFile?.content;
    // The rule the server applies on save, applied here first: a file that
    // does not parse is never sent, so the learner reads one line in the
    // editor's header instead of a toast for every blur.
    const invalid = useMemo(() => {
        if (!loadedFile?.editable || draft === undefined) return null;
        const message = validateLearnWorkspaceYaml(draft);
        return message === null
            ? null
            : describeLearnWorkspaceYamlError(message);
    }, [draft, loadedFile?.editable]);

    // A command is attached but its first poll has not landed: the terminal
    // stays busy across that gap rather than flashing its empty state
    // between the request resolving and the output arriving.
    const isAwaitingFirstPoll =
        activeCommandUuid !== null &&
        output.status === null &&
        output.error === null;
    // Busy for the walkthrough as well as the controls: from the click that
    // starts a run, across the save that click does first, until the command
    // it started has reported back. The editor's own blur autosave is not
    // part of it: nothing is running, and a step waiting on the terminal
    // would otherwise wait on an edit.
    const isBusy =
        output.isActive ||
        runCommand.isLoading ||
        isAwaitingFirstPoll ||
        isRunPending;

    // A deploy rewrites the project's explores, and the learner opens the
    // new field straight afterwards: a cached explore list would not have it.
    useEffect(() => {
        if (output.status !== 'done') return;
        if (
            activeCommand?.tool !== 'lightdash' ||
            activeCommand.subcommand !== 'deploy'
        )
            return;
        void queryClient.invalidateQueries(EXPLORE_QUERY_KEY);
    }, [output.status, activeCommand, queryClient]);

    const handleChange = useCallback(
        (content: string) => {
            if (selectedPath === null) return;
            setDrafts((prev) => ({ ...prev, [selectedPath]: content }));
        },
        [selectedPath],
    );

    /**
     * Saves the current draft and answers whether the file on disk now
     * matches the editor: true when there was nothing to save or the save
     * succeeded, false when it failed (and was reported in a toast) or when
     * there is a draft but the file itself has not loaded (still loading, or
     * failed) — there is nothing to compare the draft against, so it cannot
     * be trusted as saved.
     * Blurring the editor and then running immediately would otherwise send
     * the same write twice, so a save in flight for the same path and
     * content is awaited rather than repeated.
     */
    const saveIfDirty = useCallback(async (): Promise<boolean> => {
        const path = selectedPath;
        if (path === null || draft === undefined) return true;
        if (!loadedFile) return false;
        if (!isDirty) return true;
        if (invalid !== null) return false;
        const pending = pendingSaveRef.current;
        if (pending && pending.path === path && pending.content === draft)
            return pending.promise;
        const promise = (async () => {
            try {
                await saveFile.mutateAsync({ path, content: draft });
                // The learner may have typed on while the save was in
                // flight. Only a draft that is still what was saved is done
                // with: dropping a newer one would hand the editor the saved
                // text, which resets it and throws the cursor to the end.
                // The newer draft stays dirty and goes with the next save.
                if (draftsRef.current[path] !== draft) return true;
                setDrafts((prev) => {
                    if (prev[path] !== draft) return prev;
                    const { [path]: _saved, ...rest } = prev;
                    return rest;
                });
                return true;
            } catch (e) {
                showToastApiError({
                    title: 'Could not save the file',
                    apiError: (e as ApiError).error,
                });
                return false;
            } finally {
                const current = pendingSaveRef.current;
                if (current?.path === path && current.content === draft)
                    pendingSaveRef.current = null;
            }
        })();
        pendingSaveRef.current = { path, content: draft, promise };
        return promise;
    }, [
        draft,
        loadedFile,
        isDirty,
        invalid,
        saveFile,
        selectedPath,
        showToastApiError,
    ]);

    const handleRun = useCallback(async () => {
        setTerminalError(null);
        setIsRunPending(true);
        try {
            // A command that runs against a file the save did not reach would
            // report on the old contents, which reads as the edit having had
            // no effect; say so instead of running.
            if (!(await saveIfDirty())) {
                setTerminalError(
                    invalid !== null
                        ? `${invalid.replace(/ to continue$/, '')}, then run the command again`
                        : 'The file could not be saved, so nothing ran',
                );
                return;
            }
            const parsed = parseCommand(commandInput);
            if ('error' in parsed) {
                setTerminalError(parsed.error);
                return;
            }
            // Drop the finished command before asking for the next one so the
            // pane empties: a rejected run must not read as a footnote under
            // the previous command's output and status.
            setActiveCommandUuid(null);
            setActiveCommand(null);
            try {
                const { commandUuid } = await runCommand.mutateAsync(parsed);
                setActiveCommandUuid(commandUuid);
                setActiveCommand(parsed);
            } catch (e) {
                const message =
                    (e as ApiError).error?.message ??
                    'Could not run that command';
                // The workspace runs one command at a time: when the server
                // says another is already in flight it names it, and the pane
                // attaches to that command's output instead of reporting a
                // failure.
                const running = activeCommandFromError(message);
                if (running !== null) {
                    setActiveCommandUuid(running);
                    return;
                }
                setTerminalError(message);
            }
        } finally {
            setIsRunPending(false);
        }
    }, [commandInput, runCommand, saveIfDirty, invalid]);

    return (
        <Box className={styles.shell} data-learn-workspace>
            <Group
                className={styles.workspaceHeader}
                justify="space-between"
                wrap="nowrap"
                gap="sm"
            >
                <Group gap="xs" wrap="nowrap">
                    <Text fz="sm" fw={600} c="ldGray.9">
                        Workspace
                    </Text>
                    {route?.project.name ? (
                        <Text fz="sm" c="ldGray.6" truncate>
                            {route.project.name}
                        </Text>
                    ) : null}
                </Group>
                <Anchor
                    component={Link}
                    to={`/projects/${trainingProjectUuid}/learn`}
                    fz="sm"
                    data-learn-back-to-library
                >
                    Back to library
                </Anchor>
            </Group>
            <ResizableSplitter
                className={styles.panels}
                orientation="horizontal"
                handleLabel="Resize the file tree"
            >
                <ResizableSplitter.Pane
                    className={styles.panel}
                    defaultSize={22}
                    min={14}
                    id="learn-workspace-files"
                >
                    <ScrollArea className={styles.treePane} py="xs">
                        {isFilesError ? (
                            <InlineErrorState
                                m="xs"
                                message={
                                    filesError?.error?.message ??
                                    'Could not load the file tree'
                                }
                            />
                        ) : (
                            <FileTree
                                files={files ?? []}
                                selectedPath={selectedPath}
                                onSelect={setSelectedPath}
                            />
                        )}
                    </ScrollArea>
                </ResizableSplitter.Pane>
                <ResizableSplitter.Pane
                    className={styles.panel}
                    defaultSize={78}
                    min={40}
                    id="learn-workspace-main"
                >
                    <ResizableSplitter
                        orientation="vertical"
                        handleLabel="Resize the terminal"
                    >
                        <ResizableSplitter.Pane
                            className={styles.panel}
                            defaultSize={68}
                            min={30}
                            id="learn-workspace-editor"
                        >
                            {selectedPath !== null && isFileError ? (
                                <Center className={styles.editorEmpty}>
                                    <InlineErrorState
                                        message={
                                            fileError?.error?.message ??
                                            'Could not load the file'
                                        }
                                    />
                                </Center>
                            ) : selectedPath !== null && loadedFile ? (
                                <WorkspaceEditor
                                    path={selectedPath}
                                    content={draft ?? loadedFile.content}
                                    editable={loadedFile.editable}
                                    saving={saveFile.isLoading}
                                    dirty={isDirty}
                                    invalid={invalid}
                                    onChange={handleChange}
                                    onBlur={() => void saveIfDirty()}
                                />
                            ) : selectedPath !== null ? (
                                <Center
                                    className={styles.editorEmpty}
                                    data-learn-editor-loading
                                >
                                    <Group gap="xs">
                                        <Loader size="sm" />
                                        <Text fz="sm" c="ldGray.6">
                                            Loading file…
                                        </Text>
                                    </Group>
                                </Center>
                            ) : (
                                <Center className={styles.editorEmpty}>
                                    <Text fz="sm" c="ldGray.6">
                                        Pick a file to start
                                    </Text>
                                </Center>
                            )}
                        </ResizableSplitter.Pane>
                        <ResizableSplitter.Pane
                            className={styles.panel}
                            defaultSize={32}
                            min={15}
                            id="learn-workspace-terminal"
                        >
                            <Terminal
                                value={commandInput}
                                onValueChange={setCommandInput}
                                onRun={() => void handleRun()}
                                busy={isBusy}
                                disabled={saveFile.isLoading}
                                output={{
                                    ...output,
                                    error: terminalError ?? output.error,
                                }}
                            />
                        </ResizableSplitter.Pane>
                    </ResizableSplitter>
                </ResizableSplitter.Pane>
            </ResizableSplitter>
        </Box>
    );
};

/**
 * The sandbox workspace: an editor and terminal over the learner's training
 * copy. Access is resolved by useWorkspaceAccess — anything other than the
 * learner's own copy, with the sandbox gate open, redirects to the library.
 */
const LearnWorkspacePage: FC = () => {
    const access = useWorkspaceAccess();
    if (access.state === 'loading') return null;
    if (access.state === 'redirect') return <Navigate to={access.to} replace />;
    return (
        <Workspace
            projectUuid={access.projectUuid}
            trainingProjectUuid={access.trainingProjectUuid}
        />
    );
};

export default LearnWorkspacePage;
