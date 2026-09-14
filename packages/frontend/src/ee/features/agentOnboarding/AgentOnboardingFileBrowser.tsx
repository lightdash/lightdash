import { type AgentOnboardingFile } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Center,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    Tree,
    getTreeExpandedState,
    useMantineColorScheme,
    type RenderTreeNodePayload,
    type TreeNodeData,
    useTree,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconFile,
    IconFolder,
    IconMaximize,
    IconPlayerPlay,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import CodeBlock from '../../../components/common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    markdownSanitizeRehypePlugins,
    rehypeRemoveHeaderLinks,
} from '../../../utils/markdownUtils';
import classes from './AgentOnboardingRunPage.module.css';
import { useAgentOnboardingFile } from './hooks/useAgentOnboarding';
import {
    buildAgentOnboardingFileTree,
    sanitizeTerminalText,
    type AgentOnboardingFileTreeNode,
} from './utils';

const getPreviewLanguage = (path: string): 'json' | 'yaml' | null => {
    if (/\.json$/i.test(path)) return 'json';
    if (/\.ya?ml$/i.test(path)) return 'yaml';
    return null;
};

const RECENT_UPDATE_WINDOW_MS = 15_000;

const getLatestUpdatedFile = (
    files: AgentOnboardingFile[],
): AgentOnboardingFile | undefined =>
    files.reduce<AgentOnboardingFile | undefined>(
        (latest, file) =>
            !latest ||
            Date.parse(file.updatedAt) >= Date.parse(latest.updatedAt)
                ? file
                : latest,
        undefined,
    );

const getAncestorPaths = (path: string): string[] =>
    path
        .split('/')
        .slice(0, -1)
        .map((_, index, segments) => segments.slice(0, index + 1).join('/'));

const isRecentlyUpdated = (file: AgentOnboardingFile): boolean =>
    Date.now() - Date.parse(file.updatedAt) < RECENT_UPDATE_WINDOW_MS;

const toTreeData = (nodes: AgentOnboardingFileTreeNode[]): TreeNodeData[] =>
    nodes.map((node) => ({
        value: node.path,
        label: node.name,
        children:
            node.children.length > 0 ? toTreeData(node.children) : undefined,
    }));

const FilePreview: FC<{
    content: string;
    encoding: 'utf8' | 'base64';
    path: string;
}> = ({ content, encoding, path }) => {
    const { colorScheme } = useMantineColorScheme();

    if (encoding !== 'utf8') {
        return (
            <Center h="100%" p="xl">
                <Stack gap="xs" align="center">
                    <MantineIcon icon={IconFile} size="lg" />
                    <Text fw={600}>Preview unavailable</Text>
                    <Text c="dimmed" fz="sm" ta="center">
                        This file is binary or uses an unsupported encoding.
                    </Text>
                </Stack>
            </Center>
        );
    }

    if (/\.md$/i.test(path)) {
        return (
            <Box
                data-color-mode={colorScheme}
                className={classes.markdownPreviewContainer}
            >
                <MarkdownPreview
                    source={content}
                    rehypePlugins={markdownSanitizeRehypePlugins}
                    rehypeRewrite={rehypeRemoveHeaderLinks}
                    className={classes.markdownPreview}
                />
            </Box>
        );
    }

    const language = getPreviewLanguage(path);
    if (language) {
        return (
            <CodeBlock
                code={content}
                language={language}
                withLineNumbers
                withCopyButton={false}
                className={classes.filePreviewCode}
            />
        );
    }

    return <pre className={classes.plainTextPreview}>{content}</pre>;
};

export const AgentOnboardingFileBrowser: FC<{
    projectUuid: string;
    runUuid: string;
    files: AgentOnboardingFile[];
    isLive: boolean;
    latestActivity: string | null;
}> = ({ projectUuid, runUuid, files, isLive, latestActivity }) => {
    const [selectedPath, setSelectedPath] = useState<string>();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFollowing, setIsFollowing] = useState(true);
    const shouldFollowLatest = isLive && isFollowing;
    // Keyed on the path set so the tree is not re-initialised on every poll
    const pathsKey = files.map(({ path }) => path).join('\n');
    const treeData = useMemo(
        () => toTreeData(buildAgentOnboardingFileTree(files)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pathsKey],
    );
    const folderValues = useMemo(
        () =>
            Object.keys(getTreeExpandedState(treeData, '*')).filter((value) =>
                files.every(({ path }) => path !== value),
            ),
        [files, treeData],
    );
    const fileTree = useTree();
    const { clearSelected, expand, select } = fileTree;
    const seenFoldersRef = useRef<Set<string>>(new Set());
    const selectedFile = files.find(({ path }) => path === selectedPath);
    const fileQuery = useAgentOnboardingFile(
        projectUuid,
        runUuid,
        selectedFile,
    );

    useEffect(() => {
        if (files.length === 0) {
            setSelectedPath(undefined);
            clearSelected();
            return;
        }
        const latestFile = getLatestUpdatedFile(files);
        const nextSelectedPath = shouldFollowLatest
            ? latestFile?.path
            : files.some(({ path }) => path === selectedPath)
              ? selectedPath
              : files[0].path;
        if (nextSelectedPath && nextSelectedPath !== selectedPath) {
            setSelectedPath(nextSelectedPath);
            select(nextSelectedPath);
            getAncestorPaths(nextSelectedPath).forEach(expand);
        }
    }, [
        clearSelected,
        expand,
        files,
        select,
        selectedPath,
        shouldFollowLatest,
    ]);

    // Runs after the Tree's own initialise effect, which collapses new folders
    useEffect(() => {
        folderValues.forEach((value) => {
            if (seenFoldersRef.current.has(value)) return;
            seenFoldersRef.current.add(value);
            expand(value);
        });
    }, [expand, folderValues]);

    const renderTreeNode = ({
        node,
        expanded,
        hasChildren,
        elementProps,
        tree,
    }: RenderTreeNodePayload) => {
        const file = files.find(({ path }) => path === node.value);
        return (
            <Group
                key={file ? `${file.path}-${file.updatedAt}` : node.value}
                gap={6}
                align="center"
                wrap="nowrap"
                {...elementProps}
                data-recent={file && isRecentlyUpdated(file) ? true : undefined}
                onClick={(event) => {
                    elementProps.onClick(event);
                    if (!hasChildren) {
                        setIsFollowing(false);
                        tree.select(node.value);
                        setSelectedPath(node.value);
                    }
                }}
            >
                <Box className={classes.fileTreeToggle}>
                    {hasChildren && (
                        <MantineIcon
                            icon={expanded ? IconChevronDown : IconChevronRight}
                            size={14}
                        />
                    )}
                </Box>
                <Box className={classes.fileTreeIcon}>
                    <MantineIcon
                        icon={hasChildren ? IconFolder : IconFile}
                        size={18}
                    />
                </Box>
                <Text fz="sm" lh="20px" truncate>
                    {node.label}
                </Text>
            </Group>
        );
    };

    const preview = fileQuery.isInitialLoading ? (
        <EmptyStateLoader h="100%" />
    ) : fileQuery.isError ? (
        <Center h="100%" p="lg">
            <Text c="red" fz="sm" ta="center">
                This file could not be loaded.
            </Text>
        </Center>
    ) : fileQuery.data ? (
        <FilePreview
            content={fileQuery.data.content}
            encoding={fileQuery.data.encoding}
            path={fileQuery.data.path}
        />
    ) : (
        <Center h="100%" p="lg">
            <Text c="dimmed" fz="sm" ta="center">
                Select a file to preview it.
            </Text>
        </Center>
    );

    if (files.length === 0) {
        return (
            <Box h="100%" p="md">
                <Paper variant="dotted" h="100%">
                    <Center h="100%" p="xl">
                        <Stack gap="xs" align="center">
                            <MantineIcon
                                icon={IconFolder}
                                size="lg"
                                color="dimmed"
                            />
                            <Text fw={500}>
                                {isLive
                                    ? 'Exploring your warehouse'
                                    : 'No files were generated'}
                            </Text>
                            <Text c="dimmed" fz="sm" ta="center">
                                {isLive
                                    ? 'Your semantic layer files appear here the moment the agent starts writing them.'
                                    : 'The run ended before any project files were written.'}
                            </Text>
                            {isLive && latestActivity ? (
                                <Text
                                    c="dimmed"
                                    fz="xs"
                                    ff="monospace"
                                    ta="center"
                                    mt="sm"
                                    className={classes.emptyActivity}
                                >
                                    {sanitizeTerminalText(latestActivity)}
                                </Text>
                            ) : null}
                        </Stack>
                    </Center>
                </Paper>
            </Box>
        );
    }

    return (
        <>
            <PanelGroup direction="horizontal" className={classes.fileBrowser}>
                <Panel
                    id="onboarding-file-tree"
                    defaultSize={32}
                    minSize={18}
                    className={classes.filePanel}
                >
                    <Box className={classes.fileTree}>
                        <Tree
                            data={treeData}
                            tree={fileTree}
                            levelOffset={16}
                            py={4}
                            classNames={{ label: classes.fileTreeItem }}
                            renderNode={renderTreeNode}
                        />
                    </Box>
                </Panel>
                <PanelResizeHandle
                    className={classes.fileResizeHandle}
                    aria-label="Resize file tree and preview"
                />
                <Panel
                    id="onboarding-file-preview"
                    minSize={30}
                    className={classes.filePanel}
                >
                    <Box className={classes.filePreview}>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            px="sm"
                            py={6}
                            className={classes.filePreviewHeader}
                        >
                            <Text fz="xs" ff="monospace" c="dimmed" truncate>
                                {selectedPath}
                            </Text>
                            <Group gap={4} wrap="nowrap">
                                {isLive ? (
                                    <Button
                                        variant={
                                            isFollowing ? 'light' : 'subtle'
                                        }
                                        color={
                                            isFollowing ? 'indigo' : undefined
                                        }
                                        size="compact-xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconPlayerPlay}
                                                size={12}
                                            />
                                        }
                                        aria-pressed={isFollowing}
                                        onClick={() =>
                                            setIsFollowing((value) => !value)
                                        }
                                    >
                                        {isFollowing
                                            ? 'Following latest'
                                            : 'Follow latest'}
                                    </Button>
                                ) : null}
                                <Tooltip label="Expand preview">
                                    <ActionIcon
                                        aria-label="Expand file preview"
                                        size="sm"
                                        onClick={() => setIsExpanded(true)}
                                        disabled={!fileQuery.data}
                                    >
                                        <MantineIcon
                                            icon={IconMaximize}
                                            size="sm"
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                        <Box className={classes.filePreviewScroll}>
                            {preview}
                        </Box>
                    </Box>
                </Panel>
            </PanelGroup>
            <MantineModal
                opened={isExpanded}
                onClose={() => setIsExpanded(false)}
                title={selectedPath ?? 'File preview'}
                fullScreen
                modalBodyProps={{ px: 0, py: 0 }}
            >
                <ScrollArea h="100%">{preview}</ScrollArea>
            </MantineModal>
        </>
    );
};
