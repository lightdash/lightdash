import { createContext, useContext } from 'react';

/** A model, or one of its fields, the person pointed the chat at. */
export type StudioChatRef = {
    modelName: string;
    fieldName: string | null;
    modelLabel: string;
    fieldLabel: string | null;
};

const MIME_TYPE = 'application/x-studio-chat-ref';

export const sameStudioChatRef = (a: StudioChatRef, b: StudioChatRef) =>
    a.modelName === b.modelName && a.fieldName === b.fieldName;

export const startStudioChatRefDrag = (
    dataTransfer: DataTransfer,
    ref: StudioChatRef,
) => {
    dataTransfer.setData(MIME_TYPE, JSON.stringify(ref));
    dataTransfer.setData('text/plain', ref.fieldLabel ?? ref.modelLabel);
    dataTransfer.effectAllowed = 'copy';
};

export const isStudioChatRefDrag = (dataTransfer: DataTransfer) =>
    dataTransfer.types.includes(MIME_TYPE);

const isRef = (value: unknown): value is StudioChatRef => {
    if (typeof value !== 'object' || value === null) return false;
    const { modelName, fieldName, modelLabel, fieldLabel } = value as Record<
        string,
        unknown
    >;
    return (
        typeof modelName === 'string' &&
        typeof modelLabel === 'string' &&
        (fieldName === null || typeof fieldName === 'string') &&
        (fieldLabel === null || typeof fieldLabel === 'string')
    );
};

export const readStudioChatRefDrop = (
    dataTransfer: DataTransfer,
): StudioChatRef | null => {
    try {
        const parsed: unknown = JSON.parse(dataTransfer.getData(MIME_TYPE));
        return isRef(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

/** Adds a ref to the chat; null where there is no chat to add to. */
export const AddToStudioChatContext = createContext<
    ((ref: StudioChatRef) => void) | null
>(null);

export const useAddToStudioChat = () => useContext(AddToStudioChatContext);
