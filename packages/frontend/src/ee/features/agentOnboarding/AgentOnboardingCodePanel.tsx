import { type AgentOnboardingRun } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    CopyButton,
    Group,
    Menu,
    Text,
    Tooltip,
    UnstyledButton,
    useMantineColorScheme,
} from '@mantine/core';
import {
    IconChartBar,
    IconCheck,
    IconCopy,
    IconFile,
    IconLayoutDashboard,
    IconSelector,
    IconTable,
    IconTerminal2,
    IconX,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { Fragment, type FC } from 'react';
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
    describeAgentOnboardingFile,
    type AgentOnboardingFileKind,
} from './utils';

export type CodePanelView = { kind: 'file'; path: string } | { kind: 'log' };

const GROUPS: { kind: AgentOnboardingFileKind; label: string }[] = [
    { kind: 'model', label: 'Models' },
    { kind: 'chart', label: 'Charts' },
    { kind: 'dashboard', label: 'Dashboards' },
    { kind: 'other', label: 'Other files' },
];

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

const FilePicker: FC<{
    run: AgentOnboardingRun;
    path: string;
    onChange: (path: string) => void;
}> = ({ run, path, onChange }) => {
    const current = describeAgentOnboardingFile(path);
    return (
        <Menu position="bottom-start" withinPortal>
            <Menu.Target>
                <UnstyledButton className={classes.picker}>
                    <MantineIcon
                        icon={KIND_ICONS[current.kind]}
                        size={16}
                        className={classes.pickerIcon}
                    />
                    <Box miw={0}>
                        <Text fz="sm" fw={500} truncate>
                            {current.label}
                        </Text>
                        <Text fz={11} c="dimmed" truncate ff="monospace">
                            {path}
                        </Text>
                    </Box>
                    <MantineIcon
                        icon={IconSelector}
                        size={14}
                        className={classes.pickerIcon}
                    />
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown className={classes.menu}>
                {GROUPS.map(({ kind, label }) => {
                    const files = run.files.filter(
                        (file) =>
                            describeAgentOnboardingFile(file.path).kind ===
                            kind,
                    );
                    if (files.length === 0) return null;
                    return (
                        <Fragment key={kind}>
                            <Menu.Label>{label}</Menu.Label>
                            {files.map((file) => (
                                <Menu.Item
                                    key={file.path}
                                    leftSection={
                                        <MantineIcon icon={KIND_ICONS[kind]} />
                                    }
                                    rightSection={
                                        file.path === path ? (
                                            <MantineIcon icon={IconCheck} />
                                        ) : null
                                    }
                                    onClick={() => onChange(file.path)}
                                >
                                    {
                                        describeAgentOnboardingFile(file.path)
                                            .label
                                    }
                                </Menu.Item>
                            ))}
                        </Fragment>
                    );
                })}
            </Menu.Dropdown>
        </Menu>
    );
};

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
                        onClick={copy}
                        aria-label="Copy file"
                    >
                        <MantineIcon icon={copied ? IconCheck : IconCopy} />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    );
};

/** Side panel with the code a run wrote, one file at a time, or its raw log */
export const AgentOnboardingCodePanel: FC<{
    run: AgentOnboardingRun;
    view: CodePanelView;
    onChange: (view: CodePanelView) => void;
    onClose: () => void;
}> = ({ run, view, onChange, onClose }) => {
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
                {view.kind === 'file' ? (
                    <FilePicker
                        run={run}
                        path={view.path}
                        onChange={(path) => onChange({ kind: 'file', path })}
                    />
                ) : (
                    <Group gap="xs" wrap="nowrap" className={classes.title}>
                        <MantineIcon
                            icon={IconTerminal2}
                            size={16}
                            className={classes.pickerIcon}
                        />
                        <Text fz="sm" fw={500}>
                            Run log
                        </Text>
                    </Group>
                )}
                {view.kind === 'file' && (
                    <CopyFile run={run} path={view.path} />
                )}
                <Tooltip label={isLog ? 'Back to code' : 'Run log'}>
                    <ActionIcon
                        variant={isLog ? 'light' : 'subtle'}
                        color="gray"
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
                        <MantineIcon icon={IconTerminal2} />
                    </ActionIcon>
                </Tooltip>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={onClose}
                    aria-label="Close code panel"
                >
                    <MantineIcon icon={IconX} />
                </ActionIcon>
            </Group>
            <Box className={classes.body}>
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
    );
};
