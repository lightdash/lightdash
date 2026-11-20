import { describe, expect, it } from 'vitest';
import { resolveTitleAim } from './useTileTitleAim';

// A ⅓-width tile at 1440px: the actions straddle the corner over the title's end
const restingTitle = { left: 35, top: 168, right: 317, bottom: 192 };
const expandedTitle = { left: 35, top: 168, right: 465, bottom: 216 };
const actions = { left: 300, top: 140, right: 478, bottom: 174 };
const layout = { restingTitle, expandedTitle, actions };

describe('resolveTitleAim', () => {
    it('gives the actions their box, even over the title text', () => {
        expect(
            resolveTitleAim({
                ...layout,
                point: { x: 310, y: 170 },
                from: null,
                titleHovered: false,
            }),
        ).toBe('elsewhere');
    });

    it('does not keep the header past the title text while the title is expanded', () => {
        expect(
            resolveTitleAim({
                ...layout,
                point: { x: 400, y: 185 },
                from: null,
                titleHovered: true,
            }),
        ).toBe('elsewhere');
    });

    it('keeps an expanded title while the pointer reads its wrapped line', () => {
        expect(
            resolveTitleAim({
                ...layout,
                point: { x: 100, y: 205 },
                from: null,
                titleHovered: true,
            }),
        ).toBe('title');
    });

    it('lets go of the title while the pointer heads for the actions', () => {
        expect(
            resolveTitleAim({
                ...layout,
                point: { x: 200, y: 178 },
                from: { x: 100, y: 180 },
                titleHovered: true,
            }),
        ).toBe('headingForActions');
    });

    it('lets go of the title while the pointer rises into the actions from below', () => {
        expect(
            resolveTitleAim({
                ...layout,
                point: { x: 310, y: 186 },
                from: { x: 310, y: 191 },
                titleHovered: true,
            }),
        ).toBe('headingForActions');
    });

    it('keeps the title while the pointer moves away from the actions', () => {
        expect(
            resolveTitleAim({
                ...layout,
                point: { x: 150, y: 180 },
                from: { x: 200, y: 178 },
                titleHovered: false,
            }),
        ).toBe('title');
    });
});
