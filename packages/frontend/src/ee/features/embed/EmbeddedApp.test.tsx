import { cleanup, render } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmbeddedApp from './EmbeddedApp';

const embed = vi.hoisted(() => ({ backgroundColor: null as string | null }));

vi.mock('../../providers/Embed/useEmbed', () => ({ default: () => embed }));
vi.mock('../../providers/Embed/EmbedProvider', () => ({
    default: ({ children }: PropsWithChildren) => children,
}));

describe('iframe background lifecycle', () => {
    afterEach(() => {
        cleanup();
        embed.backgroundColor = null;
    });

    it.each([
        ['#ffffff', 'rgb(255, 255, 255)', '#ffffff'],
        ['transparent', 'transparent', 'transparent'],
        ['#f008', 'rgba(255, 0, 0, 0.533)', 'transparent'],
        ['#ff000080', 'rgba(255, 0, 0, 0.5)', 'transparent'],
        ['#f00F', 'rgb(255, 0, 0)', '#f00F'],
        ['#ff0000FF', 'rgb(255, 0, 0)', '#ff0000FF'],
    ])(
        'applies %s and cleans up when leaving the embed',
        (color, expected, headerColor) => {
            embed.backgroundColor = color;
            const { unmount } = render(<EmbeddedApp />, {
                wrapper: MemoryRouter,
            });

            expect(document.body.style.backgroundColor).toBe(expected);
            expect(document.documentElement.style.backgroundColor).toBe(
                expected,
            );
            expect(
                document.documentElement.style.getPropertyValue(
                    '--ld-embed-header-background-color',
                ),
            ).toBe(headerColor);

            unmount();

            expect(document.body.style.backgroundColor).toBe('');
            expect(document.documentElement.style.backgroundColor).toBe('');
            expect(
                document.documentElement.style.getPropertyValue(
                    '--ld-embed-header-background-color',
                ),
            ).toBe('');
            expect(
                document.documentElement.style.getPropertyValue(
                    '--ld-embed-header-surface-color',
                ),
            ).toBe('');
        },
    );

    it('leaves theme backgrounds alone without a custom color', () => {
        render(<EmbeddedApp />, { wrapper: MemoryRouter });

        expect(document.body.style.backgroundColor).toBe('');
        expect(document.documentElement.style.backgroundColor).toBe('');
        expect(
            document.documentElement.style.getPropertyValue(
                '--ld-embed-header-surface-color',
            ),
        ).toBe('');
    });
});
