import { type ApiError } from '@lightdash/common';
import { Anchor, Box, Center, Group, ScrollArea, Text } from '@mantine/core';
import { useCallback, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Link, Navigate } from 'react-router';
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

    const { data: files } = useWorkspaceFiles(projectUuid);
    const { data: file } = useWorkspaceFile(projectUuid, selectedPath);
    const saveFile = useSaveWorkspaceFile(projectUuid);
    const runCommand = useRunCommand(projectUuid);
    const output = useCommandOutput(projectUuid, activeCommandUuid);

    const draft = selectedPath === null ? undefined : drafts[selectedPath];
    const isDirty = draft !== undefined && draft !== file?.content;

    const handleChange = useCallback(
        (content: string) => {
            if (selectedPath === null) return;
            setDrafts((prev) => ({ ...prev, [selectedPath]: content }));
        },
        [selectedPath],
    );

    const saveIfDirty = useCallback(async () => {
        const path = selectedPath;
        if (path === null || !file || !isDirty || draft === undefined) return;
        try {
            await saveFile.mutateAsync({ path, content: draft });
            setDrafts((prev) => {
                const { [path]: _saved, ...rest } = prev;
                return rest;
            });
        } catch (e) {
            showToastApiError({
                title: 'Could not save the file',
                apiError: (e as ApiError).error,
            });
        }
    }, [draft, file, isDirty, saveFile, selectedPath, showToastApiError]);

    const handleRun = useCallback(async () => {
        await saveIfDirty();
        const parsed = parseCommand(commandInput);
        if ('error' in parsed) {
            setTerminalError(parsed.error);
            return;
        }
        try {
            const { commandUuid } = await runCommand.mutateAsync(parsed);
            setTerminalError(null);
            setActiveCommandUuid(commandUuid);
        } catch (e) {
            const message =
                (e as ApiError).error?.message ?? 'Could not run that command';
            // The workspace runs one command at a time: when the server says
            // another is already in flight it names it, and the pane attaches
            // to that command's output instead of reporting a failure.
            const running = activeCommandFromError(message);
            if (running !== null) {
                setTerminalError(null);
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
                        <FileTree
                            files={files ?? []}
                            selectedPath={selectedPath}
                            onSelect={setSelectedPath}
                        />
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
                            {selectedPath !== null && file ? (
                                <WorkspaceEditor
                                    path={selectedPath}
                                    content={draft ?? file.content}
                                    editable={file.editable}
                                    saving={saveFile.isLoading}
                                    dirty={isDirty}
                                    onChange={handleChange}
                                    onBlur={() => void saveIfDirty()}
                                />
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
                                running={
                                    output.isActive || runCommand.isLoading
                                }
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
