import type { UIMessageChunk } from 'ai';
import { z } from 'zod';

export type UiStreamKind = UIMessageChunk['type'];

/**
 * The part kinds the suite looks for, typed against the SDK's UI message
 * stream so a kind it never emits (e.g. 'tool-call') cannot be written.
 */
export const STREAM_KINDS = {
    error: 'error',
    textDelta: 'text-delta',
    startStep: 'start-step',
    toolInputStart: 'tool-input-start',
    toolInputDelta: 'tool-input-delta',
    toolInputAvailable: 'tool-input-available',
} satisfies Record<string, UiStreamKind>;

const partSchema = z.looseObject({ type: z.string() });

/**
 * The part types of an AI SDK UI message stream (SSE `data:` lines), in
 * order. Only the kinds are asserted, never the contents.
 */
export const uiStreamPartTypes = (body: string): string[] =>
    body.split('\n').flatMap((line) => {
        if (!line.startsWith('data: ')) return [];
        const payload = line.slice('data: '.length).trim();
        if (payload === '[DONE]') return [];
        try {
            const part = partSchema.safeParse(JSON.parse(payload));
            return part.success ? [part.data.type] : [];
        } catch {
            return [];
        }
    });
