import { createContext, useContext } from 'react';

/** Lines picked in a source file. */
export type StudioChatCode = {
    path: string;
    from: number;
    to: number;
    text: string;
};

/** A model, one of its fields, or lines of code the person pointed the chat at. */
export type StudioChatRef = {
    modelName: string;
    fieldName: string | null;
    modelLabel: string;
    fieldLabel: string | null;
    code: StudioChatCode | null;
};

const MIME_TYPE = 'application/x-studio-chat-ref';

export const sameStudioChatRef = (a: StudioChatRef, b: StudioChatRef) =>
    a.modelName === b.modelName &&
    a.fieldName === b.fieldName &&
    a.code?.path === b.code?.path &&
    a.code?.from === b.code?.from &&
    a.code?.to === b.code?.to;

const CODE_HEADING = 'Selected code:';

const formatStudioChatCode = ({ path, from, to, text }: StudioChatCode) =>
    `${path}, lines ${from} to ${to}:\n\`\`\`${path.endsWith('.sql') ? 'sql' : 'yaml'}\n${text}\n\`\`\``;

/** The question first, then the picked lines under a heading the chat can split off again. */
export const withStudioChatCode = (message: string, code: StudioChatCode[]) =>
    code.length === 0
        ? message
        : [message, CODE_HEADING, ...code.map(formatStudioChatCode)].join(
              '\n\n',
          );

/** What was asked, and which lines were picked for it. */
export const splitStudioChatCode = (
    message: string,
): { text: string; code: Omit<StudioChatCode, 'text'>[] } => {
    const at = message.indexOf(`${CODE_HEADING}\n\n`);
    if (at === -1 || (at > 0 && message.slice(at - 2, at) !== '\n\n')) {
        return { text: message, code: [] };
    }
    const code = [
        ...message.slice(at).matchAll(/^(\S[^\n]*), lines (\d+) to (\d+):$/gm),
    ].map(([, path, from, to]) => ({
        path,
        from: Number(from),
        to: Number(to),
    }));
    return { text: message.slice(0, at).trim(), code };
};

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

const isRef = (value: unknown): value is Omit<StudioChatRef, 'code'> => {
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

// Dragged refs are models and fields; code is only added from the editor.
const toRef = (value: unknown): StudioChatRef | null =>
    isRef(value) ? { ...value, code: null } : null;

export const readStudioChatRefDrop = (
    dataTransfer: DataTransfer,
): StudioChatRef | null => {
    try {
        const parsed: unknown = JSON.parse(dataTransfer.getData(MIME_TYPE));
        return toRef(parsed);
    } catch {
        return null;
    }
};

/** Adds a ref to the chat; null where there is no chat to add to. */
export const AddToStudioChatContext = createContext<
    ((ref: StudioChatRef) => void) | null
>(null);

export const useAddToStudioChat = () => useContext(AddToStudioChatContext);
