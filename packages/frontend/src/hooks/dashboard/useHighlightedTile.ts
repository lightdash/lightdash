import { useMantineTheme } from '@mantine-8/core';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

const HIGHLIGHT_TILE_SEARCH_PARAM = 'highlightTile';

/** Give tiles that are still mounting/laying out a chance to appear */
const WAIT_FOR_TILE_TIMEOUT_MS = 10_000;
const HIGHLIGHT_DURATION_MS = 800;
const HIGHLIGHT_ITERATIONS = 3;

/**
 * Builds a shareable link that lands on the dashboard and highlights a tile.
 * Keeps the current search params (filters, date zoom) so the recipient sees
 * the same view.
 */
export const getTileLinkUrl = ({
    origin,
    projectUuid,
    dashboardUuid,
    tileUuid,
    tileTabUuid,
    search,
}: {
    origin: string;
    projectUuid: string;
    dashboardUuid: string;
    tileUuid: string;
    tileTabUuid: string | null;
    search: string;
}) => {
    const searchParams = new URLSearchParams(search);
    searchParams.set(HIGHLIGHT_TILE_SEARCH_PARAM, tileUuid);

    const tabPath = tileTabUuid ? `/tabs/${tileTabUuid}` : '';
    return `${origin}/projects/${projectUuid}/dashboards/${dashboardUuid}/view${tabPath}?${searchParams.toString()}`;
};

export const useTileLinkUrl = (
    tileUuid: string,
    tileTabUuid: string | null,
) => {
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const { search } = useLocation();

    return useMemo(() => {
        if (!projectUuid || !dashboardUuid) return null;
        return getTileLinkUrl({
            origin: window.location.origin,
            projectUuid,
            dashboardUuid,
            tileUuid,
            tileTabUuid,
            search,
        });
    }, [projectUuid, dashboardUuid, search, tileUuid, tileTabUuid]);
};

/**
 * Reads the `highlightTile` search param, scrolls that tile into view and
 * flashes a ring around it. The param is removed once the tile is highlighted.
 */
export const useHighlightedTile = ({ enabled }: { enabled: boolean }) => {
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const { search, pathname } = useLocation();
    const hasHighlightedRef = useRef(false);

    const highlightTileUuid = useMemo(
        () => new URLSearchParams(search).get(HIGHLIGHT_TILE_SEARCH_PARAM),
        [search],
    );

    const clearHighlightParam = useCallback(() => {
        const searchParams = new URLSearchParams(search);
        searchParams.delete(HIGHLIGHT_TILE_SEARCH_PARAM);
        void navigate(
            { pathname, search: searchParams.toString() },
            { replace: true },
        );
    }, [navigate, pathname, search]);

    useEffect(() => {
        if (!enabled || !highlightTileUuid || hasHighlightedRef.current) return;

        const startedAt = Date.now();
        let frame: number;

        const highlightTile = () => {
            const element = document.querySelector<HTMLElement>(
                `[data-tile-uuid="${highlightTileUuid}"]`,
            );

            if (!element) {
                if (Date.now() - startedAt < WAIT_FOR_TILE_TIMEOUT_MS) {
                    frame = requestAnimationFrame(highlightTile);
                }
                return;
            }

            hasHighlightedRef.current = true;
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const ring = (spread: string) =>
                `0 0 0 ${spread} ${theme.colors.blue[4]}`;
            element.animate(
                [
                    { boxShadow: ring('0px'), borderRadius: theme.radius.md },
                    { boxShadow: ring('4px'), borderRadius: theme.radius.md },
                    { boxShadow: ring('0px'), borderRadius: theme.radius.md },
                ],
                {
                    duration: HIGHLIGHT_DURATION_MS,
                    iterations: HIGHLIGHT_ITERATIONS,
                    easing: 'ease-in-out',
                },
            );

            clearHighlightParam();
        };

        frame = requestAnimationFrame(highlightTile);
        return () => cancelAnimationFrame(frame);
    }, [
        enabled,
        highlightTileUuid,
        clearHighlightParam,
        theme.colors.blue,
        theme.radius.md,
    ]);

    return { highlightTileUuid };
};
