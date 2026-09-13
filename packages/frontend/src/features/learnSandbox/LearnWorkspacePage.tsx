import { Box } from '@mantine/core';
import { type FC } from 'react';
import { Navigate } from 'react-router';
import styles from './LearnWorkspace.module.css';
import { useWorkspaceAccess } from './useWorkspaceAccess';

/**
 * The sandbox workspace: an editor and preview over the learner's training
 * copy. Access is resolved by useWorkspaceAccess — anything other than the
 * learner's own copy, with the sandbox gate open, redirects to the library.
 */
const LearnWorkspacePage: FC = () => {
    const access = useWorkspaceAccess();
    if (access.state === 'loading') return null;
    if (access.state === 'redirect') return <Navigate to={access.to} replace />;
    return (
        <Box className={styles.shell} data-learn-workspace>
            {/* Task 5 fills this in: file tree, editor and preview. */}
        </Box>
    );
};

export default LearnWorkspacePage;
