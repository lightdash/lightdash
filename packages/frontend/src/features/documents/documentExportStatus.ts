import { createContext, useContext } from 'react';

/** Collects each chart's render outcome while a Document prints to PDF. */
export type DocumentExportStatus = {
    markReady: (chartId: string) => void;
    markErrored: (chartId: string) => void;
};

export const DocumentExportStatusContext =
    createContext<DocumentExportStatus | null>(null);

/** Null outside a PDF export, where charts stay interactive. */
export const useDocumentExportStatus = () =>
    useContext(DocumentExportStatusContext);
