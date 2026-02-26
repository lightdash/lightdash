import { useContext } from 'react';
import SourceCodeEditorContext from './SourceCodeEditorContext';

export const useSourceCodeEditor = () => {
    const context = useContext(SourceCodeEditorContext);
    if (!context) {
        throw new Error(
            'useSourceCodeEditor must be used within a SourceCodeEditorProvider',
        );
    }
    return context;
};
