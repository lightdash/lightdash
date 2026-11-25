/** Tiles on a lazily mounted tab can take a while to appear after navigation */
const WAIT_FOR_TILE_TIMEOUT_MS = 10_000;

const NO_HIGHLIGHT = { boxShadow: '0 0 0 0px transparent' };
const TILE_HIGHLIGHT = {
    boxShadow: [
        '0 0 0 1px var(--mantine-color-indigo-3)',
        '0 0 24px -8px var(--mantine-color-indigo-5)',
        '0 0 0 4px color-mix(in srgb, var(--mantine-color-indigo-5) 10%, transparent)',
    ].join(', '),
};

export function scrollToDashboardTile(tileUuid: string): boolean {
    const el = document.querySelector<HTMLElement>(
        `[data-tile-uuid="${tileUuid}"]`,
    );
    if (!el) return false;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.borderRadius = 'var(--mantine-radius-md)';
    el.animate([NO_HIGHLIGHT, TILE_HIGHLIGHT, NO_HIGHLIGHT], {
        duration: 1200,
        easing: 'ease-in-out',
    });
    return true;
}

/** Outlines the tiles where they are until the returned function is called. */
export function highlightDashboardTiles(tileUuids: string[]): () => void {
    const animations = tileUuids.flatMap((tileUuid) => {
        const el = document.querySelector<HTMLElement>(
            `[data-tile-uuid="${tileUuid}"]`,
        );
        if (!el) return [];
        el.style.borderRadius = 'var(--mantine-radius-md)';
        return [
            el.animate([NO_HIGHLIGHT, TILE_HIGHLIGHT], {
                duration: 150,
                easing: 'ease-out',
                fill: 'forwards',
            }),
        ];
    });
    return () => animations.forEach((animation) => animation.cancel());
}

/**
 * Scrolls to the tile as soon as it is in the DOM, for tiles that were just
 * added or sit on a tab that is still mounting. Returns a cancel function.
 */
export function scrollToDashboardTileWhenMounted(
    tileUuid: string,
    onScrolled: () => void = () => {},
): () => void {
    const startedAt = Date.now();
    let frame: number;

    const attempt = () => {
        if (scrollToDashboardTile(tileUuid)) {
            onScrolled();
            return;
        }
        if (Date.now() - startedAt < WAIT_FOR_TILE_TIMEOUT_MS) {
            frame = requestAnimationFrame(attempt);
        }
    };

    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
}
