import { type AgentOnboardingRun } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    CopyButton,
    Group,
    Text,
    Tooltip,
    UnstyledButton,
    useMantineColorScheme,
} from '@mantine/core';
import {
    IconChartBar,
    IconCheck,
    IconChevronRight,
    IconCopy,
    IconFile,
    IconFolder,
    IconFolderOpen,
    IconLayoutDashboard,
    IconTable,
    IconTerminal2,
    IconX,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useMemo, useState, type FC } from 'react';
import CodeBlock from '../../../components/common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    markdownSanitizeRehypePlugins,
    rehypeRemoveHeaderLinks,
} from '../../../utils/markdownUtils';
import { AgentOnboardingActivityPanel } from './AgentOnboardingActivity';
import classes from './AgentOnboardingCodePanel.module.css';
import { useAgentOnboardingFile } from './hooks/useAgentOnboarding';
import {
    buildAgentOnboardingFileTree,
    describeAgentOnboardingFile,
    type AgentOnboardingFileKind,
    type AgentOnboardingFileTreeNode,
} from './utils';

export type CodePanelView = { kind: 'file'; path: string } | { kind: 'log' };

const FileContent: FC<{ run: AgentOnboardingRun; path: string }> = ({
    run,
    path,
}) => {
    const { colorScheme } = useMantineColorScheme();
    const file = run.files.find((candidate) => candidate.path === path);
    const query = useAgentOnboardingFile(
        run.projectUuid,
        run.agentOnboardingRunUuid,
        file,
    );

    if (query.isInitialLoading) return <EmptyStateLoader h="100%" />;
    if (query.isError || !query.data) {
        return (
            <Center h="100%" p="lg">
                <Text c="dimmed" fz="sm">
                    This file could not be loaded.
                </Text>
            </Center>
        );
    }
    const { content, encoding } = query.data;
    if (encoding !== 'utf8') {
        return (
            <Center h="100%" p="lg">
                <Text c="dimmed" fz="sm">
                    No preview for this file.
                </Text>
            </Center>
        );
    }
    if (/\.md$/i.test(path)) {
        return (
            <Box data-color-mode={colorScheme} className={classes.markdown}>
                <MarkdownPreview
                    source={content}
                    rehypePlugins={markdownSanitizeRehypePlugins}
                    rehypeRewrite={rehypeRemoveHeaderLinks}
                    className={classes.markdownBody}
                />
            </Box>
        );
    }
    return (
        <CodeBlock
            code={content}
            language={/\.json$/i.test(path) ? 'json' : 'yaml'}
            withLineNumbers
            lineNumberFontSize={11}
            withCopyButton={false}
            className={classes.code}
        />
    );
};

const KIND_ICONS: Record<AgentOnboardingFileKind, TablerIcon> = {
    model: IconTable,
    chart: IconChartBar,
    dashboard: IconLayoutDashboard,
    other: IconFile,
};

const FileTree: FC<{
    nodes: AgentOnboardingFileTreeNode[];
    depth: number;
    selectedPath: string | null;
    collapsed: Set<string>;
    onToggle: (path: string) => void;
    onSelect: (path: string) => void;
}> = ({ nodes, depth, selectedPath, collapsed, onToggle, onSelect }) => (
    <Box component="ul" className={classes.treeList}>
        {nodes.map((node) => {
            const isFolder = node.file === null;
            const isOpen = isFolder && !collapsed.has(node.path);
            const icon = isFolder
                ? isOpen
                    ? IconFolderOpen
                    : IconFolder
                : KIND_ICONS[describeAgentOnboardingFile(node.path).kind];
            return (
                <Box component="li" key={node.path}>
                    <UnstyledButton
                        className={classes.treeRow}
                        data-active={node.path === selectedPath}
                        aria-expanded={isFolder ? isOpen : undefined}
                        style={{ '--depth': depth }}
                        onClick={() =>
                            isFolder ? onToggle(node.path) : onSelect(node.path)
                        }
                    >
                        <MantineIcon
                            icon={IconChevronRight}
                            size={10}
                            className={classes.treeChevron}
                            data-hidden={!isFolder}
                            data-open={isOpen}
                        />
                        <MantineIcon
                            icon={icon}
                            size={13}
                            className={classes.treeIcon}
                        />
                        <Text fz={11} truncate title={node.name}>
                            {node.name}
                        </Text>
                    </UnstyledButton>
                    {isOpen && (
                        <FileTree
                            nodes={node.children}
                            depth={depth + 1}
                            selectedPath={selectedPath}
                            collapsed={collapsed}
                            onToggle={onToggle}
                            onSelect={onSelect}
                        />
                    )}
                </Box>
            );
        })}
    </Box>
);

const CopyFile: FC<{ run: AgentOnboardingRun; path: string }> = ({
    run,
    path,
}) => {
    const query = useAgentOnboardingFile(
        run.projectUuid,
        run.agentOnboardingRunUuid,
        run.files.find((file) => file.path === path),
    );
    if (query.data?.encoding !== 'utf8') return null;
    return (
        <CopyButton value={query.data.content}>
            {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy file'}>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={copy}
                        aria-label="Copy file"
                    >
                        <MantineIcon
                            icon={copied ? IconCheck : IconCopy}
                            size={14}
                        />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    );
};

/** Side panel with the files a run wrote, browsable as a tree, or its raw log */
export const AgentOnboardingCodePanel: FC<{
    run: AgentOnboardingRun;
    view: CodePanelView;
    onChange: (view: CodePanelView) => void;
    onClose: () => void;
}> = ({ run, view, onChange, onClose }) => {
    const tree = useMemo(
        () => buildAgentOnboardingFileTree(run.files),
        [run.files],
    );
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const toggleFolder = (path: string) =>
        setCollapsed((current) => {
            const next = new Set(current);
            if (!next.delete(path)) next.add(path);
            return next;
        });
    const firstPath =
        run.files.find(
            ({ path }) => describeAgentOnboardingFile(path).kind === 'model',
        )?.path ??
        run.files[0]?.path ??
        null;
    const isLog = view.kind === 'log';

    return (
        <Box className={classes.panel}>
            <Group className={classes.header} gap={4} wrap="nowrap">
                <Group gap="xs" wrap="nowrap" className={classes.title}>
                    <MantineIcon
                        icon={
                            view.kind === 'file'
                                ? KIND_ICONS[
                                      describeAgentOnboardingFile(view.path)
                                          .kind
                                  ]
                                : IconTerminal2
                        }
                        size={14}
                        className={classes.titleIcon}
                    />
                    <Box miw={0}>
                        <Text fz="xs" fw={500} truncate>
                            {view.kind === 'file'
                                ? describeAgentOnboardingFile(view.path).label
                                : 'Run log'}
                        </Text>
                        {view.kind === 'file' &&
                            view.path !==
                                describeAgentOnboardingFile(view.path)
                                    .label && (
                                <Text
                                    fz={10}
                                    c="dimmed"
                                    ff="monospace"
                                    truncate
                                >
                                    {view.path}
                                </Text>
                            )}
                    </Box>
                </Group>
                {view.kind === 'file' && (
                    <CopyFile run={run} path={view.path} />
                )}
                <Tooltip label={isLog ? 'Back to code' : 'Run log'}>
                    <ActionIcon
                        variant={isLog ? 'light' : 'subtle'}
                        color="gray"
                        size="sm"
                        aria-label="Run log"
                        aria-pressed={isLog}
                        disabled={isLog && firstPath === null}
                        onClick={() =>
                            onChange(
                                isLog && firstPath !== null
                                    ? { kind: 'file', path: firstPath }
                                    : { kind: 'log' },
                            )
                        }
                    >
                        <MantineIcon icon={IconTerminal2} size={14} />
                    </ActionIcon>
                </Tooltip>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={onClose}
                    aria-label="Close code panel"
                >
                    <MantineIcon icon={IconX} size={14} />
                </ActionIcon>
            </Group>
            <Box className={classes.body}>
                {tree.length > 0 && (
                    <Box className={classes.tree}>
                        <FileTree
                            nodes={tree}
                            depth={0}
                            selectedPath={
                                view.kind === 'file' ? view.path : null
                            }
                            collapsed={collapsed}
                            onToggle={toggleFolder}
                            onSelect={(path) =>
                                onChange({ kind: 'file', path })
                            }
                        />
                    </Box>
                )}
                <Box className={classes.content}>
                    {view.kind === 'file' ? (
                        <FileContent run={run} path={view.path} />
                    ) : (
                        <AgentOnboardingActivityPanel
                            key={run.agentOnboardingRunUuid}
                            events={run.events}
                        />
                    )}
                </Box>
            </Box>
        </Box>
    );
};
