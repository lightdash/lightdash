import { createContext, useContext } from 'react';

/** Collects each chart cell's render outcome while a Document prints to PDF. */
export type DocumentExportStatus = {
    markReady: (cellIndex: number) => void;
    markErrored: (cellIndex: number) => void;
};

export const DocumentExportStatusContext =
    createContext<DocumentExportStatus | null>(null);

/** Null outside a PDF export, where charts stay interactive. */
export const useDocumentExportStatus = () =>
    useContext(DocumentExportStatusContext);
