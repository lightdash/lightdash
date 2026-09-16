import { act, renderHook } from '@testing-library/react';
import { useReportContents } from './useReportContents';

describe('Report scroll tracking', () => {
    it('tracks the heading above the viewport threshold and the last section at the bottom', () => {
        const headings = [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
        ];
        const { result } = renderHook(() =>
            useReportContents(headings, '[data-report-heading]'),
        );
        const body = document.createElement('div');
        body.innerHTML =
            '<h2 id="first" data-report-heading>First</h2><h2 id="second" data-report-heading>Second</h2>';
        const viewport = document.createElement('div');
        const [first, second] = Array.from(body.querySelectorAll('h2'));
        Object.defineProperties(viewport, {
            scrollHeight: { value: 1500 },
            clientHeight: { value: 500 },
        });
        vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
            new DOMRect(0, 100, 500, 500),
        );
        vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(
            new DOMRect(0, 140, 500, 30),
        );
        vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(
            new DOMRect(0, 600, 500, 30),
        );
        result.current.bodyRef.current = body;
        result.current.viewportRef.current = viewport;

        act(() => result.current.updateActiveSection());
        expect(result.current.activeSection).toBe('first');
        viewport.scrollTop = 1000;
        act(() => result.current.updateActiveSection());
        expect(result.current.activeSection).toBe('second');
        viewport.scrollTop = 0;
        vi.mocked(first.getBoundingClientRect).mockReturnValue(
            new DOMRect(0, 300, 500, 30),
        );
        act(() => result.current.updateActiveSection());
        expect(result.current.activeSection).toBeNull();
    });
});
