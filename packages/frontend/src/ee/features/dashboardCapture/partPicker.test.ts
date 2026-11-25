import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import { afterEach, describe, expect, it } from 'vitest';
import { type CaptureMark } from '../capture/types';
import { pickPartAt } from './partPicker';
import { chartUuidsForMarks } from './tilePicker';

const tiles = [
    {
        uuid: 'tile-1',
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        w: 12,
        h: 6,
        tabUuid: null,
        properties: { title: 'Revenue', savedChartUuid: 'chart-1' },
    } as DashboardTile,
];

const TILE_RECT = new DOMRect(0, 0, 400, 300);

const addTile = (html: string): HTMLElement => {
    const element = document.createElement('div');
    element.setAttribute('data-tile-uuid', 'tile-1');
    element.getBoundingClientRect = () => TILE_RECT;
    element.innerHTML = html;
    document.body.appendChild(element);
    return element;
};

// jsdom has no layout, so say what is under the pointer.
const under = (...elements: Element[]) => {
    document.elementsFromPoint = () => elements;
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('pickPartAt', () => {
    it('picks the whole tile from its title or padding', () => {
        const element = addTile('<h4>Revenue</h4>');
        under(element.querySelector('h4')!);
        expect(pickPartAt({ x: 5, y: 5 }, tiles)).toEqual({
            target: {
                kind: 'tile',
                id: 'tile-1',
                label: 'Revenue',
                parentId: null,
            },
            rect: TILE_RECT,
        });
    });

    it('picks a table cell inside a tile', () => {
        const element = addTile(
            '<table><thead><tr><th>Day</th></tr></thead><tbody><tr><td>Mon</td></tr></tbody></table>',
        );
        under(element.querySelector('td')!);
        expect(pickPartAt({ x: 5, y: 5 }, tiles)?.target).toEqual({
            kind: 'table-cell',
            id: 'tile-1/cell/body/0/0',
            label: 'cell "Mon" in column "Day" on "Revenue"',
            parentId: 'tile-1',
        });
    });

    it('picks a big number value and its comparison apart', () => {
        const element = addTile(
            '<div data-big-number-part="value"><span>1,234</span></div><div data-big-number-part="comparison"><b>+12%</b> vs last month</div>',
        );
        const rect = new DOMRect(10, 10, 80, 30);
        const value = element.querySelector('span')!;
        value.parentElement!.getBoundingClientRect = () => rect;
        under(value);
        expect(pickPartAt({ x: 5, y: 5 }, tiles)).toEqual({
            target: {
                kind: 'big-number',
                id: 'tile-1/big-number/value',
                label: 'value "1,234" on "Revenue"',
                parentId: 'tile-1',
            },
            rect,
        });
        under(element.querySelector('b')!);
        expect(pickPartAt({ x: 5, y: 5 }, tiles)?.target).toMatchObject({
            id: 'tile-1/big-number/comparison',
            label: 'comparison "+12% vs last month" on "Revenue"',
        });
    });

    it('is nothing off every tile', () => {
        under(document.body);
        expect(pickPartAt({ x: 5, y: 5 }, tiles)).toBeNull();
    });
});

describe('chartUuidsForMarks with parts', () => {
    it('counts a part of a tile as its tile', () => {
        const mark = {
            target: {
                kind: 'chart-point',
                id: 'tile-1/point/0/2',
                label: 'bar "a" on "Revenue"',
                parentId: 'tile-1',
            },
            arrowTo: null,
            covers: [],
        } as unknown as CaptureMark;
        expect(chartUuidsForMarks([mark], tiles)).toEqual(['chart-1']);
    });
});
