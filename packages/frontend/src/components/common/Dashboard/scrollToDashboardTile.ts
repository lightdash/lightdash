export function scrollToDashboardTile(tileUuid: string) {
    const el = document.querySelector<HTMLElement>(
        `[data-tile-uuid="${tileUuid}"]`,
    );
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.borderRadius = 'var(--mantine-radius-md)';
    el.animate(
        [
            { boxShadow: '0 0 0 0px transparent' },
            {
                boxShadow: [
                    '0 0 0 1px var(--mantine-color-indigo-3)',
                    '0 0 24px -8px var(--mantine-color-indigo-5)',
                    '0 0 0 4px color-mix(in srgb, var(--mantine-color-indigo-5) 10%, transparent)',
                ].join(', '),
            },
            { boxShadow: '0 0 0 0px transparent' },
        ],
        { duration: 1200, easing: 'ease-in-out' },
    );
}
