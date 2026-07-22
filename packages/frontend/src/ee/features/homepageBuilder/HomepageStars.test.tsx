import { MantineProvider } from '@mantine-8/core';
import { act, fireEvent, render } from '@testing-library/react';
import HomepageStars from './HomepageStars';

// Nothing is mocked: the cards are purpose-built presentational markup, so
// the focusability assertions below run against the real DOM.
// Answers min-width/min-height queries against a pretend viewport, so the
// tier the component picks is the one a real browser would pick.
const stubMatchMedia = ({
    reducedMotion = false,
    width = 1600,
    height = 1000,
} = {}) => {
    const fits = (query: string) => {
        const minWidth = query.match(/min-width:\s*([\d.]+)px/);
        const minHeight = query.match(/min-height:\s*([\d.]+)px/);
        if (!minWidth || !minHeight) return false;
        return width >= Number(minWidth[1]) && height >= Number(minHeight[1]);
    };
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion')
            ? reducedMotion
            : fits(query),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
};

const renderStars = () =>
    render(
        <MantineProvider>
            <HomepageStars />
        </MantineProvider>,
    );

describe('HomepageStars', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        stubMatchMedia();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('spawns stars over time and caps how many are visible at once', () => {
        const { container } = renderStars();
        const sky = container.querySelector('[inert]');
        expect(sky).not.toBeNull();
        expect(sky!.childElementCount).toBe(0);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(sky!.childElementCount).toBeGreaterThan(0);

        act(() => {
            vi.advanceTimersByTime(60000);
        });
        // MAX_STARS on screen; stars still fading out keep their slot on top
        // of that, bounded by the 12 candidate slots.
        const visible = sky!.querySelectorAll(
            '[data-star-phase]:not([data-star-phase="leaving"])',
        );
        expect(visible.length).toBeLessThanOrEqual(7);
        expect(sky!.childElementCount).toBeLessThanOrEqual(12);
    });

    it('never shows two stars with the same identity', () => {
        const { container } = renderStars();
        const sky = container.querySelector('[inert]')!;

        for (let i = 0; i < 40; i++) {
            act(() => {
                vi.advanceTimersByTime(1000);
            });
            const defs = [...sky.children].map((star) =>
                star.getAttribute('data-star-def'),
            );
            expect(new Set(defs).size).toBe(defs.length);
        }
        expect(sky.childElementCount).toBeGreaterThan(0);
    });

    it('never leaves one side empty while stars are visible', () => {
        const { container } = renderStars();
        const sky = container.querySelector('[inert]')!;

        for (let i = 0; i < 40; i++) {
            act(() => {
                vi.advanceTimersByTime(1000);
            });
            const sides = [...sky.children].map((star) =>
                star.getAttribute('data-side'),
            );
            if (sides.length > 0) {
                expect(sides).toContain('left');
                expect(sides).toContain('right');
            }
        }
        // The loop must have actually exercised star activity.
        expect(sky.childElementCount).toBeGreaterThan(0);
    });

    it('keeps stars on a side a full card apart', () => {
        const { container } = renderStars();
        const sky = container.querySelector('[inert]')!;

        for (let i = 0; i < 40; i++) {
            act(() => {
                vi.advanceTimersByTime(1000);
            });
            const bySide = new Map<string, number[]>();
            [...sky.children].forEach((star) => {
                const side = star.getAttribute('data-side')!;
                const top = Number.parseFloat(
                    (star as HTMLElement).style.getPropertyValue('--star-top'),
                );
                bySide.set(side, [...(bySide.get(side) ?? []), top]);
            });
            bySide.forEach((tops) => {
                const sorted = [...tops].sort((a, b) => a - b);
                sorted.slice(1).forEach((top, index) => {
                    // The wide tier needs 20.6% between slot centres; the
                    // jitter is already included in these positions.
                    expect(top - sorted[index]).toBeGreaterThanOrEqual(18.6);
                });
            });
        }
    });

    it('expires stars even when animationend never fires', () => {
        const { container } = renderStars();
        const sky = container.querySelector('[inert]')!;

        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(sky.childElementCount).toBeGreaterThan(0);
        const earlyStar = sky.children[0];

        // jsdom never fires animationend; the timeout fallback must still
        // remove the star (max lifetime 8000ms + 300ms buffer).
        act(() => {
            vi.advanceTimersByTime(60000);
        });
        expect(earlyStar.isConnected).toBe(false);
    });

    it('settles a star out of its entry animation, then removes it once it leaves', () => {
        const { container } = renderStars();
        const sky = container.querySelector('[inert]')!;

        act(() => {
            vi.advanceTimersByTime(600);
        });
        const star = sky.children[0];
        expect(star).toHaveAttribute('data-star-phase', 'entering');

        act(() => {
            fireEvent.animationEnd(star);
        });
        expect(star).toHaveAttribute('data-star-phase', 'settled');

        // Its lifetime elapses: the star starts leaving, and only then does
        // animationend remove it. Lifetimes are random, so step until it
        // turns — well inside the 300ms slack before the removal fallback.
        for (
            let i = 0;
            i < 60 && star.getAttribute('data-star-phase') !== 'leaving';
            i++
        ) {
            act(() => {
                vi.advanceTimersByTime(200);
            });
        }
        expect(star).toHaveAttribute('data-star-phase', 'leaving');
        expect(star.isConnected).toBe(true);

        act(() => {
            fireEvent.animationEnd(star);
        });
        expect(star.isConnected).toBe(false);
    });

    it('contains no focusable elements and is inert + aria-hidden', () => {
        const { container } = renderStars();
        const sky = container.querySelector('[inert]')!;
        expect(sky).toHaveAttribute('aria-hidden');

        act(() => {
            vi.advanceTimersByTime(30000);
        });
        expect(sky.childElementCount).toBeGreaterThan(0);
        expect(sky.querySelectorAll('a, button')).toHaveLength(0);
    });

    it('keeps one timer per star no matter how long the page stays open', () => {
        const { container, unmount } = renderStars();
        const sky = container.querySelector('[inert]')!;

        act(() => {
            vi.advanceTimersByTime(120000);
        });
        expect(sky.childElementCount).toBeGreaterThan(0);
        // At most one timer per star (12 slots cap the total), plus the spawn
        // timer — timers must not accumulate with time on the page.
        expect(vi.getTimerCount()).toBeLessThanOrEqual(13);

        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('still shows stars on a smaller viewport, at a narrower width', () => {
        stubMatchMedia({ width: 1280, height: 820 });
        const { container } = renderStars();
        const sky = container.querySelector('[inert]')!;

        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(sky.childElementCount).toBeGreaterThan(0);
        const star = sky.children[0] as HTMLElement;
        // 170px scaled by one of the three card sizes.
        expect(['133px', '150px', '170px']).toContain(
            star.style.getPropertyValue('--star-width'),
        );
    });

    it('renders nothing when the viewport is too small for even the narrow tier', () => {
        stubMatchMedia({ width: 1100, height: 820 });
        const { container } = renderStars();

        act(() => {
            vi.advanceTimersByTime(10000);
        });
        expect(container.querySelector('[inert]')).toBeNull();
    });

    it('renders nothing and schedules no stars under prefers-reduced-motion', () => {
        stubMatchMedia({ reducedMotion: true });
        const { container } = renderStars();

        act(() => {
            vi.advanceTimersByTime(10000);
        });
        expect(container.querySelector('[inert]')).toBeNull();
    });
});
