const readNavigationId = (): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    const candidate = new URLSearchParams(window.location.search).get(
        'navigationId',
    );
    return candidate &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            candidate,
        )
        ? candidate
        : undefined;
};

// Keep the original document identity even if app code changes its URL later.
export const documentNavigationId = readNavigationId();
