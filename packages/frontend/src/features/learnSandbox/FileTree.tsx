import type { LearnWorkspaceFileSummary } from '@lightdash/common';
import { NavLink, Text } from '@mantine/core';
import {
    IconChevronRight,
    IconFile,
    IconFolder,
    IconLock,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { buildFileTree, type FileNode } from './buildFileTree';
// eslint-disable-next-line css-modules/no-unused-class -- classes used in WorkspaceEditor.tsx
import styles from './LearnWorkspace.module.css';

/** Directories expanded on first render; everything else starts collapsed. */
const DEFAULT_EXPANDED_DIRS = new Set(['models']);

type FileTreeNodeProps = {
    node: FileNode;
    level: number;
    selectedPath: string | null;
    onSelect: (path: string) => void;
};

const FileTreeNode: FC<FileTreeNodeProps> = ({
    node,
    level,
    selectedPath,
    onSelect,
}) => {
    const isDirectory = !!node.children;
    const [isExpanded, setIsExpanded] = useState(
        isDirectory && DEFAULT_EXPANDED_DIRS.has(node.path),
    );
    const isReadOnly = !isDirectory && !node.editable;
    const isSelected = !isDirectory && selectedPath === node.path;

    const handleClick = () => {
        if (isDirectory) {
            setIsExpanded((prev) => !prev);
        } else {
            onSelect(node.path);
        }
    };

    return (
        <>
            <NavLink
                classNames={{ root: styles.fileTreeNode }}
                pl={level * 16 + 8}
                label={
                    <Text fz="sm" c={isReadOnly ? 'ldGray.5' : undefined}>
                        {node.name}
                    </Text>
                }
                color="dark"
                leftSection={
                    isDirectory ? (
                        <MantineIcon
                            icon={IconChevronRight}
                            className={
                                isExpanded
                                    ? styles.chevronExpanded
                                    : styles.chevron
                            }
                        />
                    ) : (
                        <MantineIcon
                            icon={IconFile}
                            color={isReadOnly ? 'ldGray.4' : 'ldGray.5'}
                        />
                    )
                }
                rightSection={
                    isDirectory ? (
                        <MantineIcon icon={IconFolder} color="ldGray.5" />
                    ) : isReadOnly ? (
                        <MantineIcon icon={IconLock} color="ldGray.4" />
                    ) : null
                }
                active={isSelected}
                onClick={handleClick}
                data-tour-anchor={!isDirectory ? 'workspace-file' : undefined}
                data-tour-hint={!isDirectory ? 'Open the file' : undefined}
                data-tour-hint-named={!isDirectory ? 'Open {value}' : undefined}
                data-tour-value={!isDirectory ? node.path : undefined}
                data-learn-file={!isDirectory ? node.path : undefined}
                data-learn-editable={
                    !isDirectory ? String(!!node.editable) : undefined
                }
            />
            {isDirectory &&
                isExpanded &&
                node.children?.map((child) => (
                    <FileTreeNode
                        key={child.path}
                        node={child}
                        level={level + 1}
                        selectedPath={selectedPath}
                        onSelect={onSelect}
                    />
                ))}
        </>
    );
};

type FileTreeProps = {
    files: LearnWorkspaceFileSummary[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
};

const FileTree: FC<FileTreeProps> = ({ files, selectedPath, onSelect }) => {
    const tree = useMemo(() => buildFileTree(files), [files]);

    return (
        <>
            {tree.map((node) => (
                <FileTreeNode
                    key={node.path}
                    node={node}
                    level={0}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                />
            ))}
        </>
    );
};

export default FileTree;
