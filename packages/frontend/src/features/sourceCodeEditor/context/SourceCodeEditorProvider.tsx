import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import SourceCodeEditorContext, {
    type SourceCodeEditorContextValue,
} from './SourceCodeEditorContext';

type SourceCodeEditorProviderProps = {
    children: ReactNode;
};

/**
 * Provides context for the source code editor drawer.
 *
 * NOTE: This provider only manages state/context. The actual SourceCodeDrawer
 * component is rendered by ProjectLayout/DashboardLayout to ensure it appears
 * after the NavBar in the render order.
 */
const SourceCodeEditorProvider: FC<SourceCodeEditorProviderProps> = ({
    children,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();

    // Core state
    const [projectUuid, setProjectUuid] = useState<string | null>(null);
    const [currentBranch, setCurrentBranch] = useState<string | null>(null);
    const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Drawer open state is derived from URL
    const isOpen = searchParams.get('editor') === '1';

    const open = useCallback(
        (options?: { file?: string; branch?: string; explore?: string }) => {
            const params = new URLSearchParams(location.search);
            params.set('editor', '1');
            if (options?.branch) params.set('branch', options.branch);
            if (options?.file) params.set('file', options.file);
            if (options?.explore) params.set('explore', options.explore);
            void navigate({ search: params.toString() }, { replace: true });
        },
        [location.search, navigate],
    );

    const close = useCallback(() => {
        const params = new URLSearchParams(location.search);
        params.delete('editor');
        params.delete('branch');
        params.delete('file');
        params.delete('explore');
        void navigate({ search: params.toString() }, { replace: true });
    }, [location.search, navigate]);

    const toggle = useCallback(() => {
        if (isOpen) {
            close();
        } else {
            open();
        }
    }, [isOpen, open, close]);

    const value = useMemo<SourceCodeEditorContextValue>(
        () => ({
            isOpen,
            open,
            close,
            toggle,
            projectUuid,
            currentBranch,
            currentFilePath,
            hasUnsavedChanges,
            setProjectUuid,
            setCurrentBranch,
            setCurrentFilePath,
            setHasUnsavedChanges,
        }),
        [
            isOpen,
            open,
            close,
            toggle,
            projectUuid,
            currentBranch,
            currentFilePath,
            hasUnsavedChanges,
        ],
    );

    return (
        <SourceCodeEditorContext.Provider value={value}>
            {children}
        </SourceCodeEditorContext.Provider>
    );
};

export default SourceCodeEditorProvider;
