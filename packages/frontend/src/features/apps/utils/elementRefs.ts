import {
    elementReferenceToWireString,
    type DataAppElementReference,
} from '@lightdash/common';

/** An element reference picked from the iframe inspector. */
export type ElementRef = DataAppElementReference;

/**
 * Parse `[tag "text" @loc]` (or `[tag @loc]`, `[tag "text"]`, `[tag]`) from
 * the iframe inspector's `lightdash:inspect:selected` payload. Returns null
 * if the label doesn't match the expected shape — defensive against future
 * SDK versions that might emit a different format.
 */
export function parseElementRefLabel(label: string): ElementRef | null {
    // Loc allows any char except `]` (which terminates the reference) so
    // paths with spaces (e.g. `My Component/App.tsx:42`) round-trip cleanly.
    const m =
        /^\[([A-Za-z][A-Za-z0-9-]*)(?:\s+"([^"]*)")?(?:\s+@([^\]]+))?\]$/.exec(
            label,
        );
    if (!m) return null;
    return { tag: m[1] ?? '', text: m[2] ?? '', loc: m[3] ?? '' };
}

/** Serialize back to the wire format the agent receives in the prompt. */
export const refToWireString = elementReferenceToWireString;

/** Stable identity for dedupe and React keys. */
export function elementRefKey(ref: ElementRef): string {
    return refToWireString(ref);
}

/** Short label for the attachment pill, e.g. `<h1> FORMULA 1`. */
export function elementRefChipLabel({ tag, text }: ElementRef): string {
    return text ? `<${tag}> ${text}` : `<${tag}>`;
}
