import { type GitBranch } from '@lightdash/common';
import { Box, Stack, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';
import BranchSelector from './BranchSelector';
import FileTree from './FileTree';
// eslint-disable-next-line css-modules/no-unused-class -- classes used in FileTree.tsx
import styles from './SourceCodeSidebar.module.css';

type SourceCodeSidebarProps = {
    projectUuid: string;
    branches: GitBranch[];
    currentBranch: string | null;
    currentFilePath: string | null;
    onBranchChange: (branch: string) => void;
    onCreateBranch: () => void;
    onFileSelect: (path: string) => void;
    isLoadingBranches?: boolean;
};

const SourceCodeSidebar: FC<SourceCodeSidebarProps> = ({
    projectUuid,
    branches,
    currentBranch,
    currentFilePath,
    onBranchChange,
    onCreateBranch,
    onFileSelect,
    isLoadingBranches,
}) => (
    <Box className={styles.sidebar}>
        <Stack gap="xs" className={styles.header}>
            <Title order={5}>Source Code</Title>
            <Text fz="xs" c="ldGray.6">
                Browse and edit your dbt project files
            </Text>
            <BranchSelector
                branches={branches}
                currentBranch={currentBranch}
                onBranchChange={onBranchChange}
                onCreateBranch={onCreateBranch}
                isLoading={isLoadingBranches}
            />
        </Stack>
        <FileTree
            projectUuid={projectUuid}
            branch={currentBranch}
            currentFilePath={currentFilePath}
            onFileSelect={onFileSelect}
        />
    </Box>
);

export default SourceCodeSidebar;
