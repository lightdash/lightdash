import { type GitFileEntry } from '@lightdash/common';
import { Loader, NavLink, ScrollArea, Stack, Text } from '@mantine-8/core';
import { IconChevronRight, IconFile, IconFolder } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useGitDirectory } from '../../hooks';
// eslint-disable-next-line css-modules/no-unused-class -- classes used in this component
import styles from './SourceCodeSidebar.module.css';

type FileTreeNodeProps = {
    entry: GitFileEntry;
    projectUuid: string;
    branch: string;
    currentFilePath: string | null;
    onFileSelect: (path: string) => void;
    level: number;
};

const FileTreeNode: FC<FileTreeNodeProps> = ({
    entry,
    projectUuid,
    branch,
    currentFilePath,
    onFileSelect,
    level,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const isDirectory = entry.type === 'dir';
    const isSelected = currentFilePath === entry.path;

    const { data: contents, isLoading } = useGitDirectory(
        projectUuid,
        branch,
        isExpanded && isDirectory ? entry.path : undefined,
    );

    const handleClick = () => {
        if (isDirectory) {
            setIsExpanded(!isExpanded);
        } else {
            onFileSelect(entry.path);
        }
    };

    const entries =
        contents?.type === 'directory' ? contents.entries : undefined;
    const sortedEntries = entries?.sort((a, b) => {
        // Directories first, then alphabetically
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
    });

    return (
        <>
            <NavLink
                classNames={{ root: styles.fileTreeNode }}
                pl={level * 16 + 8}
                label={entry.name}
                color="dark"
                leftSection={
                    isDirectory ? (
                        isLoading && isExpanded ? (
                            <Loader size={14} />
                        ) : (
                            <MantineIcon
                                icon={IconChevronRight}
                                className={
                                    isExpanded
                                        ? styles.chevronExpanded
                                        : styles.chevron
                                }
                            />
                        )
                    ) : (
                        <MantineIcon icon={IconFile} color="ldGray.5" />
                    )
                }
                rightSection={
                    isDirectory ? (
                        <MantineIcon icon={IconFolder} color="ldGray.5" />
                    ) : null
                }
                active={isSelected}
                onClick={handleClick}
            />
            {isExpanded &&
                sortedEntries?.map((childEntry) => (
                    <FileTreeNode
                        key={childEntry.path}
                        entry={childEntry}
                        projectUuid={projectUuid}
                        branch={branch}
                        currentFilePath={currentFilePath}
                        onFileSelect={onFileSelect}
                        level={level + 1}
                    />
                ))}
        </>
    );
};

type FileTreeProps = {
    projectUuid: string;
    branch: string | null;
    currentFilePath: string | null;
    onFileSelect: (path: string) => void;
};

const FileTree: FC<FileTreeProps> = ({
    projectUuid,
    branch,
    currentFilePath,
    onFileSelect,
}) => {
    const { data, isLoading, error } = useGitDirectory(
        projectUuid,
        branch ?? undefined,
    );

    if (!branch) {
        return (
            <Stack p="md" align="center">
                <Text c="ldGray.5" fz="sm">
                    Select a branch to view files
                </Text>
            </Stack>
        );
    }

    if (isLoading) {
        return (
            <Stack p="md" align="center">
                <Loader size="sm" />
                <Text c="ldGray.5" fz="sm">
                    Loading files...
                </Text>
            </Stack>
        );
    }

    if (error) {
        return (
            <Stack p="md" align="center">
                <Text c="red" fz="sm">
                    Failed to load files
                </Text>
            </Stack>
        );
    }

    const entries = data?.type === 'directory' ? data.entries : [];
    const sortedEntries = [...entries].sort((a, b) => {
        // Directories first, then alphabetically
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
    });

    if (sortedEntries.length === 0) {
        return (
            <Stack p="md" align="center">
                <Text c="ldGray.5" fz="sm">
                    No files found
                </Text>
            </Stack>
        );
    }

    return (
        <ScrollArea flex={1} offsetScrollbars>
            {sortedEntries.map((entry) => (
                <FileTreeNode
                    key={entry.path}
                    entry={entry}
                    projectUuid={projectUuid}
                    branch={branch}
                    currentFilePath={currentFilePath}
                    onFileSelect={onFileSelect}
                    level={0}
                />
            ))}
        </ScrollArea>
    );
};

export default FileTree;
