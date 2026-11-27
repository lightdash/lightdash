import { createContext } from 'react';

// Prototype only: ?proto=1 turns on the object-first Studio, ?proto=0 turns it off
const KEY = 'studio-proto';

const readFlag = (): boolean => {
    try {
        const asked = new URLSearchParams(window.location.search).get('proto');
        if (asked !== null) window.localStorage.setItem(KEY, asked);
        return window.localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
};

export const IS_STUDIO_PROTO = readFlag();

export const PROTO_TABLE_PARAM = 'table';

/** Prototype: where the bar's two halves go once the bar itself is gone; null leaves the bar as it is. */
export const ProtoSlotsContext = createContext<{
    status: HTMLElement | null;
    actions: HTMLElement | null;
} | null>(null);

/** Prototype: the person's place, carried between the model and code views so neither starts over. */
export const protoPlace: {
    /** The field open on the model page, by name. */
    openField: string | null;
    /** Where the caret last was in a file's code. */
    caret: { path: string; text: string; line: number } | null;
    /** The field the model page opens on arrival. */
    arrive: string | null;
} = { openField: null, caret: null, arrive: null };

/** Prototype: the sidebar's one search, handed to the file tree so it needs no box of its own; null leaves the tree its own. */
export const ProtoFileSearchContext = createContext<string | null>(null);
