import { describe, expect, it } from 'vitest';
import { permissionsPolicyHeader } from './permissionsPolicy';

describe('permissionsPolicyHeader', () => {
    it('blocks the camera and the microphone by default', () => {
        expect(permissionsPolicyHeader({ microphoneEnabled: false })).toBe(
            'camera=(), microphone=()',
        );
    });

    it('lets the page itself use the microphone when enabled', () => {
        expect(permissionsPolicyHeader({ microphoneEnabled: true })).toBe(
            'camera=(), microphone=(self)',
        );
    });
});
