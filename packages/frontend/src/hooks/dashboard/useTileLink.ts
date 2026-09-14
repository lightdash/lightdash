import { type DashboardTile } from '@lightdash/common';
import { useClipboard } from '@mantine/hooks';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { scrollToDashboardTile } from '../../components/common/Dashboard/scrollToDashboardTile';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useToaster from '../toaster/useToaster';
import { useOptionalProjectRoute } from '../useProjectRoute';

const HIGHLIGHT_TILE_SEARCH_PARAM = 'highlightTile';

/** Tiles on a lazily mounted tab can take a while to appear after navigation */
const WAIT_FOR_TILE_TIMEOUT_MS = 10_000;

/**
 * Builds a shareable link that lands on the dashboard and highlights a tile.
 * Keeps the current search params (filters, date zoom) so the recipient sees
 * the same view.
 */
export const getTileLinkUrl = ({
    origin,
    projectUrlIdentifier,
    dashboardSlug,
    tileUuid,
    tileTabUuid,
    search,
}: {
    origin: string;
    projectUrlIdentifier: string;
    dashboardSlug: string;
    tileUuid: string;
    tileTabUuid: string | null;
    search: string;
}) => {
    const searchParams = new URLSearchParams(search);
    searchParams.set(HIGHLIGHT_TILE_SEARCH_PARAM, tileUuid);

    const tabPath = tileTabUuid ? `/tabs/${tileTabUuid}` : '';
    return `${origin}/projects/${projectUrlIdentifier}/dashboards/${dashboardSlug}/view${tabPath}?${searchParams.toString()}`;
};

/**
 * Returns a callback that copies the tile's link to the clipboard, or null
 * when the tile isn't rendered inside a linkable dashboard route.
 */
export const useCopyTileLink = (tile: DashboardTile) => {
    const projectRoute = useOptionalProjectRoute();
    const dashboardSlug = useDashboardContext((c) => c.dashboard?.slug);
    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();

    const projectUrlIdentifier = projectRoute?.projectUrlIdentifier;
    const tileTabUuid = tile.tabUuid ?? null;

    return useMemo(() => {
        if (!projectUrlIdentifier || !dashboardSlug) return null;
        return () => {
            clipboard.copy(
                getTileLinkUrl({
                    origin: window.location.origin,
                    projectUrlIdentifier,
                    dashboardSlug,
                    tileUuid: tile.uuid,
                    tileTabUuid,
                    search: window.location.search,
                }),
            );
            showToastSuccess({ title: 'Link to tile copied to clipboard!' });
        };
    }, [
        projectUrlIdentifier,
        dashboardSlug,
        clipboard,
        showToastSuccess,
        tile.uuid,
        tileTabUuid,
    ]);
};

/**
 * Reads the `highlightTile` search param, scrolls that tile into view and
 * flashes a ring around it. The param is removed once the tile is highlighted.
 */
export const useHighlightedTile = ({ enabled }: { enabled: boolean }) => {
    const navigate = useNavigate();
    const { search, pathname } = useLocation();
    const hasHighlightedRef = useRef(false);

    const highlightTileUuid = useMemo(
        () => new URLSearchParams(search).get(HIGHLIGHT_TILE_SEARCH_PARAM),
        [search],
    );

    useEffect(() => {
        if (!enabled || !highlightTileUuid || hasHighlightedRef.current) return;

        const startedAt = Date.now();
        let frame: number;

        const highlightTile = () => {
            if (!scrollToDashboardTile(highlightTileUuid)) {
                if (Date.now() - startedAt < WAIT_FOR_TILE_TIMEOUT_MS) {
                    frame = requestAnimationFrame(highlightTile);
                }
                return;
            }

            hasHighlightedRef.current = true;
            const searchParams = new URLSearchParams(search);
            searchParams.delete(HIGHLIGHT_TILE_SEARCH_PARAM);
            void navigate(
                { pathname, search: searchParams.toString() },
                { replace: true },
            );
        };

        frame = requestAnimationFrame(highlightTile);
        return () => cancelAnimationFrame(frame);
    }, [enabled, highlightTileUuid, navigate, pathname, search]);

    return { highlightTileUuid };
};
