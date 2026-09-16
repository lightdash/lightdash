import { describe, expect, it } from 'vitest';
import {
    aiArtifactSlice,
    selectPreviewForThreads,
    setPreview,
    type AiPreview,
} from './aiArtifactSlice';

const { reducer } = aiArtifactSlice;

const wrap = (aiArtifact: ReturnType<typeof reducer>) => ({ aiArtifact });

const dataAppPreview: AiPreview = {
    type: 'dataApp',
    appUuid: 'app-1',
    messageUuid: 'message-1',
    threadUuid: 'thread-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    version: 3,
    latestReadyVersionAtOpen: 3,
};

describe('selectPreviewForThreads', () => {
    it('is null when nothing is previewed', () => {
        const state = wrap(reducer(undefined, { type: '@@init' }));
        expect(selectPreviewForThreads(['thread-1'])(state)).toBeNull();
    });

    it('returns the preview when its thread is on screen', () => {
        const state = wrap(reducer(undefined, setPreview(dataAppPreview)));
        expect(selectPreviewForThreads(['thread-1'])(state)).toEqual(
            dataAppPreview,
        );
        expect(
            selectPreviewForThreads(['thread-0', 'thread-1'])(state),
        ).toEqual(dataAppPreview);
    });

    it('hides a preview that belongs to another thread', () => {
        const state = wrap(reducer(undefined, setPreview(dataAppPreview)));
        expect(selectPreviewForThreads(['thread-2'])(state)).toBeNull();
    });

    it('hides every preview when no thread is on screen', () => {
        const state = wrap(reducer(undefined, setPreview(dataAppPreview)));
        expect(selectPreviewForThreads([])(state)).toBeNull();
    });
});
