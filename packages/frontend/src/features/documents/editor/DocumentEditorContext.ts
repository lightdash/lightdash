import { createContext, useContext } from 'react';

export type DocumentEditorTarget = {
    projectUuid: string;
    spaceUuid: string;
    documentUuid: string;
    versionUuid: string;
};

const DocumentEditorContext = createContext<DocumentEditorTarget | null>(null);

export const DocumentEditorProvider = DocumentEditorContext.Provider;

export const useDocumentEditorTarget = (): DocumentEditorTarget => {
    const target = useContext(DocumentEditorContext);
    if (!target) {
        throw new Error(
            'useDocumentEditorTarget must be used within DocumentEditorProvider',
        );
    }
    return target;
};
