import { type ApiError } from '@lightdash/common';
import {
    Anchor,
    Box,
    Center,
    Group,
    Loader,
    ScrollArea,
    Text,
} from '@mantine/core';
import { useCallback, useRef, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Link, Navigate } from 'react-router';
import InlineErrorState from '../../components/common/InlineErrorState';
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

    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [commandInput, setCommandInput] = useState('');
    const [activeCommandUuid, setActiveCommandUuid] = useState<string | null>(
        null,
    );
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
    const draft = selectedPath === null ? undefined : drafts[selectedPath];
    const isDirty = draft !== undefined && draft !== loadedFile?.content;

    // A command is attached but its first poll has not landed: the terminal
    // stays busy across that gap rather than flashing its empty state
    // between the request resolving and the output arriving.
    const isAwaitingFirstPoll =
        activeCommandUuid !== null &&
        output.status === null &&
        output.error === null;
    const isRunning =
        output.isActive || runCommand.isLoading || isAwaitingFirstPoll;

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
        const pending = pendingSaveRef.current;
        if (pending && pending.path === path && pending.content === draft)
            return pending.promise;
        const promise = (async () => {
            try {
                await saveFile.mutateAsync({ path, content: draft });
                setDrafts((prev) => {
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
    }, [draft, loadedFile, isDirty, saveFile, selectedPath, showToastApiError]);

    const handleRun = useCallback(async () => {
        setTerminalError(null);
        // A command that runs against a file the save did not reach would
        // report on the old contents, which reads as the edit having had no
        // effect; say so instead of running.
        if (!(await saveIfDirty())) {
            setTerminalError('The file could not be saved, so nothing ran');
            return;
        }
        const parsed = parseCommand(commandInput);
        if ('error' in parsed) {
            setTerminalError(parsed.error);
            return;
        }
        // Drop the finished command before asking for the next one so the
        // pane empties: a rejected run must not read as a footnote under the
        // previous command's output and status.
        setActiveCommandUuid(null);
        try {
            const { commandUuid } = await runCommand.mutateAsync(parsed);
            setActiveCommandUuid(commandUuid);
        } catch (e) {
            const message =
                (e as ApiError).error?.message ?? 'Could not run that command';
            // The workspace runs one command at a time: when the server says
            // another is already in flight it names it, and the pane attaches
            // to that command's output instead of reporting a failure.
            const running = activeCommandFromError(message);
            if (running !== null) {
                setActiveCommandUuid(running);
                return;
            }
            setTerminalError(message);
        }
    }, [commandInput, runCommand, saveIfDirty]);

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
            <PanelGroup className={styles.panels} direction="horizontal">
                <Panel
                    className={styles.panel}
                    defaultSize={22}
                    minSize={14}
                    id="learn-workspace-files"
                    order={1}
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
                </Panel>
                <PanelResizeHandle
                    aria-label="Resize the file tree"
                    className={styles.handleVertical}
                />
                <Panel
                    className={styles.panel}
                    minSize={40}
                    id="learn-workspace-main"
                    order={2}
                >
                    <PanelGroup direction="vertical">
                        <Panel
                            className={styles.panel}
                            minSize={30}
                            id="learn-workspace-editor"
                            order={1}
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
                        </Panel>
                        <PanelResizeHandle
                            aria-label="Resize the terminal"
                            className={styles.handleHorizontal}
                        />
                        <Panel
                            className={styles.panel}
                            defaultSize={32}
                            minSize={15}
                            id="learn-workspace-terminal"
                            order={2}
                        >
                            <Terminal
                                value={commandInput}
                                onValueChange={setCommandInput}
                                onRun={() => void handleRun()}
                                running={isRunning}
                                disabled={saveFile.isLoading}
                                output={{
                                    ...output,
                                    error: terminalError ?? output.error,
                                }}
                            />
                        </Panel>
                    </PanelGroup>
                </Panel>
            </PanelGroup>
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
