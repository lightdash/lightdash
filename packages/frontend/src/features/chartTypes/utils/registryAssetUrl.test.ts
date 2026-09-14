import { describe, expect, it } from 'vitest';
import { registryThumbnailPath } from './registryAssetUrl';

describe('registryThumbnailPath', () => {
    const item = {
        thumbnail: 'charts/sankey/1.2.0/thumb.png',
        thumbnailDark: 'charts/sankey/1.2.0/thumb-dark.png',
    };

    it('returns the light thumbnail for the light scheme', () => {
        expect(registryThumbnailPath(item, 'light')).toBe(item.thumbnail);
    });

    it('returns the dark variant for the dark scheme', () => {
        expect(registryThumbnailPath(item, 'dark')).toBe(item.thumbnailDark);
    });

    it('falls back to the light thumbnail when no dark variant exists', () => {
        expect(
            registryThumbnailPath({ ...item, thumbnailDark: null }, 'dark'),
        ).toBe(item.thumbnail);
    });

    it('propagates a missing thumbnail as null', () => {
        expect(
            registryThumbnailPath(
                { thumbnail: null, thumbnailDark: null },
                'dark',
            ),
        ).toBeNull();
    });
});
