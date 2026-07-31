import { type HomepageMediaCard } from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { act, fireEvent, render } from '@testing-library/react';
import { EventName } from '../../../types/Events';
import HomepageStars from './HomepageStars';

const { track, useHomepageMediaCards } = vi.hoisted(() => ({
    track: vi.fn(),
    useHomepageMediaCards: vi.fn(),
}));

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track, data: { rudder: true } }),
}));

vi.mock('./hooks/useHomepageMediaCards', () => ({ useHomepageMediaCards }));

type MediaCardsState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'success'; cards: HomepageMediaCard[] };

const mockMediaCards = (state: MediaCardsState) => {
    useHomepageMediaCards.mockReturnValue({
        isSuccess: state.status === 'success',
        isError: state.status === 'error',
        data: state.status === 'success' ? state.cards : undefined,
    });
};

// Only tracking is mocked: the cards are purpose-built presentational markup,
// so the focusability assertions below run against the real DOM.
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

const SKY_SELECTOR = '[data-testid="homepage-stars-sky"]';

const VIDEO_HREF = 'https://www.youtube.com/watch?v=BwvgHQyhI1o';

const MANAGED_CARD: HomepageMediaCard = {
    cardKey: 'managed-webinar',
    title: 'Managed webinar',
    subtitle: 'Curated from the console',
    url: 'https://www.lightdash.com/webinar',
    thumbnailUrl: null,
};

// Every draw returns the top of its range, so the last free def is always the
// one picked — and the media cards sit last in the catalogue.
const forceMediaCards = () => vi.spyOn(Math, 'random').mockReturnValue(0.99);

describe('HomepageStars', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        stubMatchMedia();
        track.mockClear();
        mockMediaCards({ status: 'error' });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('spawns stars over time and caps how many are visible at once', () => {
        const { container } = renderStars();
        const sky = container.querySelector(SKY_SELECTOR);
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
        const sky = container.querySelector(SKY_SELECTOR)!;

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
        const sky = container.querySelector(SKY_SELECTOR)!;

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
        const sky = container.querySelector(SKY_SELECTOR)!;

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
        const sky = container.querySelector(SKY_SELECTOR)!;

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
        const sky = container.querySelector(SKY_SELECTOR)!;

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

    it('hides decorative stars from assistive tech and keeps them unfocusable', () => {
        const { container } = renderStars();
        const sky = container.querySelector(SKY_SELECTOR)!;
        expect(sky).not.toHaveAttribute('inert');
        expect(sky).not.toHaveAttribute('aria-hidden');

        act(() => {
            vi.advanceTimersByTime(30000);
        });
        const decorative = sky.querySelectorAll('[aria-hidden="true"]');
        expect(decorative.length).toBeGreaterThan(0);
        decorative.forEach((star) => {
            expect(star.querySelectorAll('a, button, [tabindex]')).toHaveLength(
                0,
            );
        });
    });

    it('falls back to the built-in media cards when the managed list fails', () => {
        forceMediaCards();
        const { container } = renderStars();
        const sky = container.querySelector(SKY_SELECTOR)!;

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        const links = [...sky.querySelectorAll('a')];
        expect(links.map((link) => link.getAttribute('href'))).toContain(
            VIDEO_HREF,
        );
        links.forEach((link) => {
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute(
                'rel',
                expect.stringContaining('noreferrer'),
            );
            // Named by the card title, not by an aria-hidden wrapper.
            expect(link.closest('[aria-hidden="true"]')).toBeNull();
        });
        expect(
            sky.querySelector(`a[href="${VIDEO_HREF}"]`)?.textContent,
        ).toContain(
            'What can you build with Lightdash Data Apps? 3 real examples',
        );
    });

    it('tracks a click on a media card', () => {
        forceMediaCards();
        const { container } = renderStars();

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        const link = container.querySelector(`a[href="${VIDEO_HREF}"]`)!;
        fireEvent.click(link);

        expect(track).toHaveBeenCalledWith({
            name: EventName.HOMEPAGE_STARS_MEDIA_CARD_CLICKED,
            properties: { cardKey: 'data-apps-video', href: VIDEO_HREF },
        });
    });

    it('shows the managed cards instead of the fallback ones', () => {
        mockMediaCards({ status: 'success', cards: [MANAGED_CARD] });
        forceMediaCards();
        const { container } = renderStars();
        const sky = container.querySelector(SKY_SELECTOR)!;

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        const link = sky.querySelector(`a[href="${MANAGED_CARD.url}"]`);
        expect(link).not.toBeNull();
        expect(link!.textContent).toContain(MANAGED_CARD.title);
        expect(sky.querySelector(`a[href="${VIDEO_HREF}"]`)).toBeNull();

        fireEvent.click(link!);
        expect(track).toHaveBeenCalledWith({
            name: EventName.HOMEPAGE_STARS_MEDIA_CARD_CLICKED,
            properties: {
                cardKey: MANAGED_CARD.cardKey,
                href: MANAGED_CARD.url,
            },
        });
    });

    it('restarts the sky safely when the card list arrives late', () => {
        forceMediaCards();
        const { container, rerender } = renderStars();
        const sky = container.querySelector(SKY_SELECTOR)!;

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(sky.querySelector(`a[href="${VIDEO_HREF}"]`)).not.toBeNull();

        mockMediaCards({ status: 'success', cards: [MANAGED_CARD] });
        act(() => {
            rerender(
                <MantineProvider>
                    <HomepageStars />
                </MantineProvider>,
            );
        });
        expect(sky.childElementCount).toBe(0);

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(
            sky.querySelector(`a[href="${MANAGED_CARD.url}"]`),
        ).not.toBeNull();
    });

    it('shows no media stars when the managed list is empty', () => {
        mockMediaCards({ status: 'success', cards: [] });
        forceMediaCards();
        const { container } = renderStars();
        const sky = container.querySelector(SKY_SELECTOR)!;

        act(() => {
            vi.advanceTimersByTime(30000);
        });
        expect(sky.childElementCount).toBeGreaterThan(0);
        expect(sky.querySelectorAll('a')).toHaveLength(0);
        expect(sky.querySelectorAll('[data-star-def^="media-"]')).toHaveLength(
            0,
        );
    });

    it('spawns no stars until the managed card list settles', () => {
        mockMediaCards({ status: 'loading' });
        const { container } = renderStars();
        const sky = container.querySelector(SKY_SELECTOR)!;

        act(() => {
            vi.advanceTimersByTime(30000);
        });
        expect(sky.childElementCount).toBe(0);
    });

    it('keeps one timer per star no matter how long the page stays open', () => {
        const { container, unmount } = renderStars();
        const sky = container.querySelector(SKY_SELECTOR)!;

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
        const sky = container.querySelector(SKY_SELECTOR)!;

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
        expect(container.querySelector(SKY_SELECTOR)).toBeNull();
    });

    it('renders nothing and schedules no stars under prefers-reduced-motion', () => {
        stubMatchMedia({ reducedMotion: true });
        const { container } = renderStars();

        act(() => {
            vi.advanceTimersByTime(10000);
        });
        expect(container.querySelector(SKY_SELECTOR)).toBeNull();
    });
});
