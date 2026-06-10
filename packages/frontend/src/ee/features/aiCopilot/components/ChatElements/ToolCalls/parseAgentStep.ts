import { type AiWritebackStep } from '@lightdash/common';

/**
 * Reconstruct a structured step from a live progress message string (the
 * inverse of the backend's `formatWritebackStep`). The completed view reads the
 * persisted structured steps; the live stream only carries the formatted
 * string, so this lets the same grouped rendering drive both. Keep in sync with
 * `formatWritebackStep` in the backend AiWritebackService utils.
 */
export const parseAgentStep = (message: string): AiWritebackStep => {
    if (message.startsWith('Reading ')) {
        return { kind: 'read', label: message.slice('Reading '.length) };
    }
    if (message.startsWith('Editing ')) {
        return { kind: 'edit', label: message.slice('Editing '.length) };
    }
    const search = message.match(/^Searching for "(.*)"$/);
    if (search) {
        return { kind: 'search', label: search[1] };
    }
    if (message === 'Compiling project') {
        return { kind: 'compile', label: 'project' };
    }
    return { kind: 'stage', label: message };
};
