import type { LearnWorkspaceFileSummary } from '@lightdash/common';

export type FileNode = {
    name: string;
    path: string;
    editable?: boolean;
    children?: FileNode[];
};

const sortSiblings = (nodes: FileNode[]): FileNode[] =>
    [...nodes].sort((a, b) => {
        const aIsDir = !!a.children;
        const bIsDir = !!b.children;
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

const sortTree = (nodes: FileNode[]): FileNode[] =>
    sortSiblings(nodes).map((node) =>
        node.children ? { ...node, children: sortTree(node.children) } : node,
    );

/**
 * Nests a flat list of workspace files into a directory tree. Directories
 * are synthesised from path segments; only leaves carry `editable`.
 */
export const buildFileTree = (
    files: LearnWorkspaceFileSummary[],
): FileNode[] => {
    const root: FileNode[] = [];

    for (const file of files) {
        const segments = file.path.split('/').filter(Boolean);
        let siblings = root;
        let currentPath = '';

        segments.forEach((segment, index) => {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            const isLeaf = index === segments.length - 1;

            if (isLeaf) {
                siblings.push({
                    name: segment,
                    path: currentPath,
                    editable: file.editable,
                });
                return;
            }

            let dir = siblings.find((node) => node.path === currentPath);
            if (!dir) {
                dir = { name: segment, path: currentPath, children: [] };
                siblings.push(dir);
            }
            dir.children ??= [];
            siblings = dir.children;
        });
    }

    return sortTree(root);
};
