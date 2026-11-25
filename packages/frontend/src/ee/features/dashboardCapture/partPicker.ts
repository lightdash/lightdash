import { type DashboardTile } from '@lightdash/common';
import { type CaptureTarget } from '../capture/types';
import { pickChartAt } from './chartPicker';
import { clip, onTile, type PartTile } from './partLabel';
import { pickTableAt } from './tablePicker';
import { tileAtPoint, tileTarget } from './tilePicker';

type Picked = { target: CaptureTarget; rect: DOMRect };

const BIG_NUMBER_PART = 'data-big-number-part';

// A big number's value or its comparison, when they are drawn apart.
const pickBigNumberAt = (hit: Element, tile: PartTile): Picked | null => {
    const element = hit.closest(`[${BIG_NUMBER_PART}]`);
    const part = element?.getAttribute(BIG_NUMBER_PART);
    const text = (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!element || !text) return null;
    if (part !== 'value' && part !== 'comparison') return null;
    return {
        target: {
            kind: 'big-number',
            id: `${tile.uuid}/big-number/${part}`,
            label: onTile(`${part} "${clip(text, 40)}"`, tile.title),
            parentId: tile.uuid,
        },
        rect: element.getBoundingClientRect(),
    };
};

/**
 * A pick: the smallest nameable thing under a viewport point (a bar, a legend
 * entry, an axis, a table cell, a big number), else the tile it is on.
 */
export const pickPartAt = (
    point: { x: number; y: number },
    tiles: DashboardTile[],
): Picked | null => {
    const found = tileAtPoint(point, tiles);
    if (!found) return null;
    const whole = tileTarget(found.tile);
    const tile: PartTile = { uuid: found.tile.uuid, title: whole.label };
    return (
        pickBigNumberAt(found.hit, tile) ??
        pickTableAt(found.hit, found.element, tile) ??
        pickChartAt(found.hit, point, tile) ?? {
            target: whole,
            rect: found.element.getBoundingClientRect(),
        }
    );
};
