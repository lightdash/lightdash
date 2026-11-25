import { afterEach, describe, expect, it } from 'vitest';
import { pickTableAt } from './tablePicker';

const tile = { uuid: 'tile-1', title: 'Orders by customer' };

// A tile holding a table; jsdom has no layout, so rects are given.
const addTable = (html: string): HTMLElement => {
    const element = document.createElement('div');
    element.setAttribute('data-tile-uuid', 'tile-1');
    element.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200);
    element.innerHTML = `<table>${html}</table>`;
    document.body.appendChild(element);
    return element;
};

const TABLE = `
    <thead><tr><th>Customer</th><th><span>Total  orders</span></th></tr></thead>
    <tbody>
        <tr><td>Ada</td><td><a><span>12</span></a></td></tr>
        <tr data-index="7"><td>Grace</td><td></td></tr>
    </tbody>`;

afterEach(() => {
    document.body.innerHTML = '';
});

describe('pickTableAt', () => {
    it('picks a body cell with its value and its column header', () => {
        const element = addTable(TABLE);
        const span = element.querySelector('tbody span')!;
        const cell = span.closest('td')!;
        cell.getBoundingClientRect = () => new DOMRect(150, 40, 100, 20);
        expect(pickTableAt(span, element, tile)).toEqual({
            target: {
                kind: 'table-cell',
                id: 'tile-1/cell/body/0/1',
                label: 'cell "12" in column "Total orders" on "Orders by customer"',
                parentId: 'tile-1',
            },
            rect: new DOMRect(150, 40, 100, 20),
        });
    });

    it('finds the header by where the cell is drawn when it can', () => {
        const element = addTable(TABLE);
        const [first, second] = element.querySelectorAll('th');
        first.getBoundingClientRect = () => new DOMRect(0, 0, 150, 20);
        second.getBoundingClientRect = () => new DOMRect(150, 0, 150, 20);
        // Drawn under the second header although it is first in its row.
        const cell = element.querySelector('tbody td')!;
        cell.getBoundingClientRect = () => new DOMRect(160, 40, 100, 20);
        expect(pickTableAt(cell, element, tile)?.target.label).toBe(
            'cell "Ada" in column "Total orders" on "Orders by customer"',
        );
    });

    it('picks a header cell as its column', () => {
        const element = addTable(TABLE);
        const span = element.querySelector('thead span')!;
        expect(pickTableAt(span, element, tile)?.target).toEqual({
            kind: 'table-column',
            id: 'tile-1/column/0/1',
            label: 'column "Total orders" on "Orders by customer"',
            parentId: 'tile-1',
        });
    });

    it('tells an empty cell apart and keys rows by their own index', () => {
        const element = addTable(TABLE);
        const cell = element.querySelectorAll('tbody tr')[1].children[1];
        expect(pickTableAt(cell, element, tile)?.target).toMatchObject({
            id: 'tile-1/cell/body/7/1',
            label: 'empty cell in column "Total orders" on "Orders by customer"',
        });
    });

    it('counts spanned headers when there is no layout to go by', () => {
        const element = addTable(`
            <thead><tr><th colspan="2">Name</th><th>Total</th></tr></thead>
            <tbody><tr><td>Ada</td><td>Lovelace</td><td>12</td></tr></tbody>`);
        const cells = element.querySelectorAll('tbody td');
        expect(pickTableAt(cells[1], element, tile)?.target.label).toContain(
            'cell "Lovelace" in column "Name"',
        );
        expect(pickTableAt(cells[2], element, tile)?.target.label).toContain(
            'cell "12" in column "Total"',
        );
    });

    it('keeps the outline inside the tile', () => {
        const element = addTable(TABLE);
        const cell = element.querySelector('tbody td')!;
        cell.getBoundingClientRect = () => new DOMRect(250, 190, 100, 20);
        expect(pickTableAt(cell, element, tile)?.rect).toEqual(
            new DOMRect(250, 190, 50, 10),
        );
    });

    it('is nothing off a table, on a spacer cell, or in another tile', () => {
        const element = addTable(
            `<tbody><tr><td aria-hidden="true"></td><td>1</td></tr></tbody>`,
        );
        const other = document.createElement('div');
        expect(
            pickTableAt(document.createElement('p'), element, tile),
        ).toBeNull();
        expect(
            pickTableAt(element.querySelector('td')!, element, tile),
        ).toBeNull();
        expect(
            pickTableAt(element.querySelectorAll('td')[1], other, tile),
        ).toBeNull();
    });
});
