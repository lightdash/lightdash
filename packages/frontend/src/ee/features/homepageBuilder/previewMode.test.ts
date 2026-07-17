import { resolveCanvasMode } from './previewMode';

describe('resolveCanvasMode', () => {
    it('is edit when not previewing and no audience is selected', () => {
        expect(resolveCanvasMode(false, null)).toBe('edit');
    });

    it('is preview when manually previewing with no audience selected', () => {
        expect(resolveCanvasMode(true, null)).toBe('preview');
    });

    it('is preview when an audience is selected, even while editing', () => {
        expect(resolveCanvasMode(false, { type: 'user', userUuid: 'u1' })).toBe(
            'preview',
        );
    });

    it('is preview when both previewing and an audience is selected', () => {
        expect(
            resolveCanvasMode(true, { type: 'role', role: 'editor' as any }),
        ).toBe('preview');
    });
});
