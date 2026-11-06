import { type ExternalSource } from '@lightdash/common';
import { createContext, useContext } from 'react';

/**
 * What a person who manages external sources can do to them;
 * ExternalSourceManager provides it.
 */
export type ExternalSourceActions = {
    add: () => void;
    preview: (source: ExternalSource) => void;
    rename: (source: ExternalSource) => void;
    replaceFile: (source: ExternalSource) => void;
    remove: (source: ExternalSource) => void;
};

export const ExternalSourceActionsContext =
    createContext<ExternalSourceActions | null>(null);

/** Null for people who don't manage external sources. */
export const useExternalSourceActions = () =>
    useContext(ExternalSourceActionsContext);
