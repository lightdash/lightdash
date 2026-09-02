// Guards the package's public entry point: a re-export that goes missing (or a
// value export that shadows a type, as `LearnDemo` once did) fails here rather
// than in a downstream consumer.
import { describe, expect, it } from 'vitest';
import {
    createLearnModel,
    LearnDemo,
    LearnUiProvider,
    LessonBody,
    type LearnDemoManifest,
} from './index';

describe('package entry point', () => {
    it('exports the provider, the model factory and the lesson components', () => {
        expect(typeof LearnUiProvider).toBe('function');
        expect(typeof createLearnModel).toBe('function');
        expect(typeof LessonBody).toBe('function');
        expect(typeof LearnDemo).toBe('function');
    });

    it('exports the demo manifest type alongside the demo component', () => {
        const manifest: LearnDemoManifest = {
            id: 'x',
            title: 'x',
            viewport: { width: 1, height: 1 },
            steps: [],
        };
        expect(manifest.id).toBe('x');
    });
});
