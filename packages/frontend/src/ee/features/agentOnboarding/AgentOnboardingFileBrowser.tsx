import { type AgentOnboardingFile } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    ScrollArea,
    Stack,
    Text,
    Tree,
    getTreeExpandedState,
    useMantineColorScheme,
    type RenderTreeNodePayload,
    type TreeNodeData,
    useTree,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconFile,
    IconFolder,
    IconGripVertical,
    IconMaximize,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import CodeBlock from '../../../components/common/CodeBlock/CodeBlock';
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
    type AgentOnboardingFileTreeNode,
} from './utils';

const getPreviewLanguage = (path: string): 'json' | 'yaml' | null => {
    if (/\.json$/i.test(path)) return 'json';
    if (/\.ya?ml$/i.test(path)) return 'yaml';
    return null;
};

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
}> = ({ projectUuid, runUuid, files }) => {
    const [selectedPath, setSelectedPath] = useState<string>();
    const [isExpanded, setIsExpanded] = useState(false);
    const treeData = useMemo(
        () => toTreeData(buildAgentOnboardingFileTree(files)),
        [files],
    );
    const allNodesExpanded = useMemo<Record<string, boolean>>(
        () => getTreeExpandedState(treeData, '*') as Record<string, boolean>,
        [treeData],
    );
    const fileTree = useTree({ initialExpandedState: allNodesExpanded });
    const { clearSelected, select, setExpandedState } = fileTree;
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
        } else if (!files.some(({ path }) => path === selectedPath)) {
            const nextSelectedPath = files[0].path;
            setSelectedPath(nextSelectedPath);
            select(nextSelectedPath);
        }
    }, [clearSelected, files, select, selectedPath]);

    useEffect(() => {
        setExpandedState((current) => {
            let changed = false;
            const next = { ...current };
            Object.keys(allNodesExpanded).forEach((value) => {
                if (!(value in current)) {
                    next[value] = true;
                    changed = true;
                }
            });
            return changed ? next : current;
        });
    }, [allNodesExpanded, setExpandedState]);

    const renderTreeNode = ({
        node,
        expanded,
        hasChildren,
        elementProps,
        tree,
    }: RenderTreeNodePayload) => (
        <Group
            gap={6}
            align="center"
            wrap="nowrap"
            {...elementProps}
            onClick={(event) => {
                elementProps.onClick(event);
                if (!hasChildren) {
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

    const preview = fileQuery.isInitialLoading ? (
        <Center h="100%">
            <Loader size="sm" />
        </Center>
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
            <Center h="100%" p="xl">
                <Stack gap="xs" align="center">
                    <MantineIcon icon={IconFolder} size="lg" />
                    <Text fw={600}>Generated files will appear here</Text>
                    <Text c="dimmed" fz="sm" ta="center">
                        The preview refreshes as the agent creates and updates
                        your project files.
                    </Text>
                </Stack>
            </Center>
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
                >
                    <MantineIcon icon={IconGripVertical} size={14} />
                </PanelResizeHandle>
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
                            <Text fz="xs" ff="monospace" truncate>
                                {selectedPath}
                            </Text>
                            <ActionIcon
                                aria-label="Expand file preview"
                                variant="subtle"
                                size="sm"
                                onClick={() => setIsExpanded(true)}
                                disabled={!fileQuery.data}
                            >
                                <MantineIcon icon={IconMaximize} size="sm" />
                            </ActionIcon>
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
