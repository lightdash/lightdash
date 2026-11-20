import { type JSONContent } from '@tiptap/react';

/** Capture images that fit in the remaining attachment slots, earliest first. */
export const imagesThatFit = (
    images: File[],
    alreadyAttached: number,
    max: number,
): { fit: File[]; dropped: number } => {
    const free = Math.max(0, max - alreadyAttached);
    const fit = images.slice(0, free);
    return { fit, dropped: images.length - fit.length };
};

/** One editor paragraph per summary line. */
export const summaryToContent = (summary: string): JSONContent[] =>
    summary
        .split('\n')
        .map((line) =>
            line
                ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
                : { type: 'paragraph' },
        );
