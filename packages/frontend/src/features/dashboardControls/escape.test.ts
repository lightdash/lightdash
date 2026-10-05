import { describe, expect, it } from 'vitest';
import { isGuardedPress } from './escape';

const render = (html: string): HTMLElement => {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
};

const bar = render(`
    <div data-control-guard="true">
        <span id="icon"></span>
        <div><button id="other"><span id="other-label">Status</span><span id="other-remove"></span></button></div>
        <button id="open" aria-pressed="true"><span id="open-label">Plan</span><span id="open-remove"></span></button>
        <button id="add">Add control</button>
    </div>
    <div><button id="zoom">Default zoom</button></div>
    <div id="popover"><button id="apply">Apply</button></div>
`);
const get = (id: string): Element => {
    const element = bar.querySelector(`#${id}`);
    if (!element) throw new Error(`No element ${id}`);
    return element;
};

describe('isGuardedPress', () => {
    it.each(['other', 'other-label', 'other-remove', 'add'])(
        'guards a press on %s',
        (id) => {
            expect(isGuardedPress(get(id))).toBe(true);
        },
    );

    it.each(['open', 'open-label', 'open-remove'])(
        'leaves a press on the open pill alone (%s)',
        (id) => {
            expect(isGuardedPress(get(id))).toBe(false);
        },
    );

    it.each(['icon', 'zoom', 'popover', 'apply'])(
        'leaves a press outside the pills and "Add control" alone (%s)',
        (id) => {
            expect(isGuardedPress(get(id))).toBe(false);
        },
    );
});
