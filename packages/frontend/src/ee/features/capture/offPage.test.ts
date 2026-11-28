import { describe, expect, it } from 'vitest';
import { offPageFinder } from './offPage';

const VIEW = new DOMRect(0, 0, 1000, 800);
const at = (element: Element, x: number, y: number, w = 100, h = 100) => {
    element.getBoundingClientRect = () => new DOMRect(x, y, w, h);
};
const inView = (element: Element) => {
    const box = element.getBoundingClientRect();
    return (
        box.bottom > VIEW.top &&
        box.top < VIEW.bottom &&
        box.right > VIEW.left &&
        box.left < VIEW.right
    );
};

const tile = (position: string, y: number) => {
    document.body.innerHTML = `<div id="tile" style="position: ${position}"><p id="content"></p><div id="menu"></div></div>`;
    at(document.getElementById('tile')!, 0, y);
    at(document.getElementById('content')!, 0, y);
    at(document.getElementById('menu')!, 0, y);
};

describe('offPageFinder', () => {
    it('leaves out what is inside a tile scrolled out of view', () => {
        tile('absolute', -500);
        const isOffPage = offPageFinder(inView);
        expect(isOffPage(document.getElementById('content')!)).toBe(true);
        // The tile itself stays, so the page keeps its shape.
        expect(isOffPage(document.getElementById('tile')!)).toBe(false);
    });

    it('keeps something of the tile that is in view', () => {
        tile('absolute', -500);
        at(document.getElementById('menu')!, 0, 10);
        const isOffPage = offPageFinder(inView);
        expect(isOffPage(document.getElementById('menu')!)).toBe(false);
    });

    it('keeps a tile in view', () => {
        tile('absolute', 100);
        const isOffPage = offPageFinder(inView);
        expect(isOffPage(document.getElementById('content')!)).toBe(false);
    });

    it('keeps what holds the page in shape', () => {
        tile('static', -500);
        const isOffPage = offPageFinder(inView);
        expect(isOffPage(document.getElementById('content')!)).toBe(false);
    });
});
