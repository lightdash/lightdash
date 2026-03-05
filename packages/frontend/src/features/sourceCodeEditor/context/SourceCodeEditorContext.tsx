import { createContext } from 'react';

export type SourceCodeEditorContextValue = {
    // Drawer state
    isOpen: boolean;
    open: (options?: {
        file?: string;
        branch?: string;
        explore?: string;
    }) => void;
    close: () => void;
    toggle: () => void;

    // Editor state
    projectUuid: string | null;
    currentBranch: string | null;
    currentFilePath: string | null;
    hasUnsavedChanges: boolean;

    // State setters (for internal use by the content component)
    setProjectUuid: (uuid: string | null) => void;
    setCurrentBranch: (branch: string | null) => void;
    setCurrentFilePath: (path: string | null) => void;
    setHasUnsavedChanges: (hasChanges: boolean) => void;
};

const defaultContextValue: SourceCodeEditorContextValue = {
    isOpen: false,
    open: () => {},
    close: () => {},
    toggle: () => {},
    projectUuid: null,
    currentBranch: null,
    currentFilePath: null,
    hasUnsavedChanges: false,
    setProjectUuid: () => {},
    setCurrentBranch: () => {},
    setCurrentFilePath: () => {},
    setHasUnsavedChanges: () => {},
};

const SourceCodeEditorContext =
    createContext<SourceCodeEditorContextValue>(defaultContextValue);

export default SourceCodeEditorContext;
