import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireCitations } from './citations';

const LESSON = `
<p>Reach a space from Browse<a class="cit" href="#fig-1" data-hl="r1">1</a>.</p>
<span class="figwrap" id="fig-1">
  <img src="x.png" alt="">
  <span class="hlbox" data-r="r1" data-label="1 · Browse" style="left:10.5%;top:1.2%;width:7.5%;height:4%"></span>
  <span class="hlbox" data-r="r2" data-label="2 · Other" style="left:50%;top:1.2%;width:7.5%;height:4%"></span>
</span>
<p>Another<a class="cit" href="#fig-1" data-hl="r2">2</a>.</p>
`;

describe('wireCitations', () => {
    let scope: HTMLElement;
    let dispose: () => void;

    beforeEach(() => {
        scope = document.createElement('div');
        scope.innerHTML = LESSON;
        document.body.appendChild(scope);
        Element.prototype.scrollIntoView = vi.fn();
        dispose = wireCitations(scope);
    });

    afterEach(() => {
        dispose();
        scope.remove();
    });

    const pin = (n: number) =>
        scope.querySelectorAll('a.cit')[n] as HTMLElement;
    const box = (r: string) => scope.querySelector(`.hlbox[data-r="${r}"]`)!;

    it('lights the matching box on hover and clears on mouseout', () => {
        pin(0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        expect(pin(0).classList.contains('active')).toBe(true);
        expect(box('r1').classList.contains('active')).toBe(true);
        expect(box('r2').classList.contains('active')).toBe(false);

        pin(0).dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        expect(pin(0).classList.contains('active')).toBe(false);
        expect(box('r1').classList.contains('active')).toBe(false);
    });

    it('moves the highlight between pins and follows focus', () => {
        pin(0).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(box('r1').classList.contains('active')).toBe(true);
        pin(1).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(box('r1').classList.contains('active')).toBe(false);
        expect(box('r2').classList.contains('active')).toBe(true);
    });

    it('click keeps the highlight, scrolls to the figure and does not navigate', () => {
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        pin(1).dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(box('r2').classList.contains('active')).toBe(true);
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

        box('r2').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(box('r2').classList.contains('active')).toBe(false);
    });

    it('disposer removes the listeners and any active state', () => {
        pin(0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        dispose();
        expect(box('r1').classList.contains('active')).toBe(false);
        pin(0).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        expect(box('r1').classList.contains('active')).toBe(false);
        dispose = () => {};
    });
});
