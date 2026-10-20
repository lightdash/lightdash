import {
    isStandardDateGranularity,
    type DateGranularity,
} from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    dashboardDateZoomActions,
    selectControlGranularities,
    selectDateZoomGranularity,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../features/dashboard/store';

type Props = {
    dashboardUuid: string | undefined;
    isDashboardLoaded: boolean;
    isEditMode: boolean;
    configDefaultDateZoomGranularity: DateGranularity | string | undefined;
    isDateZoomDisabledInConfig: boolean | undefined;
    dateZoomGranularities: (DateGranularity | string)[];
    defaultDateZoomGranularity: DateGranularity | string | undefined;
};

/**
 * Keeps the runtime date zoom granularities in the URL and applies the
 * configured default and allowed granularities. Renders nothing.
 */
const DashboardDateZoomSync: FC<Props> = ({
    dashboardUuid,
    isDashboardLoaded,
    isEditMode,
    configDefaultDateZoomGranularity,
    isDateZoomDisabledInConfig,
    dateZoomGranularities,
    defaultDateZoomGranularity,
}) => {
    const { search, pathname } = useLocation();
    // Mirrors `search` without re-triggering effects that should fire on other
    // deps (e.g. dashboard load) while still reading the live URL.
    const searchRef = useRef(search);
    searchRef.current = search;
    const navigate = useNavigate();
    const embed = useEmbed();
    const dispatch = useDashboardDispatch();

    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    const controlGranularities = useDashboardSelector(
        selectControlGranularities,
    );

    // Reset per-control runtime overrides when the dashboard identity changes;
    // each control's default comes from its persisted granularity. Skip when the
    // URL carries `dateZoom.<control>` overrides (deep link / refresh), mirroring
    // the global default's URL guard so URL hydration isn't clobbered when the
    // dashboard query resolves after mount.
    useEffect(() => {
        const hasUrlOverride = [
            ...new URLSearchParams(searchRef.current).keys(),
        ].some((key) => key.startsWith('dateZoom.'));
        if (hasUrlOverride) return;
        dispatch(dashboardDateZoomActions.clearControlGranularities());
    }, [dispatch, dashboardUuid]);

    // Update dashboard url date zoom change
    // Only sync URL in regular dashboards or 'direct' embed mode (not 'sdk' mode)
    useEffect(() => {
        if (embed.mode === 'sdk') {
            return;
        }

        const currentParams = new URLSearchParams(search);
        const newParams = new URLSearchParams(search);
        if (dateZoomGranularity === undefined) {
            newParams.delete('dateZoom');
        } else {
            newParams.set('dateZoom', dateZoomGranularity.toLowerCase());
        }

        const currentSearch = currentParams.toString();
        const newSearch = newParams.toString();

        if (currentSearch !== newSearch) {
            void navigate(
                {
                    pathname,
                    search: newParams.toString(),
                },
                { replace: true },
            );
        }
    }, [dateZoomGranularity, search, navigate, pathname, embed.mode]);

    // Sync per-control runtime grain overrides to `dateZoom.<controlUuid>` URL
    // params (the global `?dateZoom` above is unchanged and drives the Default).
    // Written lowercased to match the global write; normalized back to canonical
    // DateGranularity case on read.
    useEffect(() => {
        if (embed.mode === 'sdk') {
            return;
        }

        const params = new URLSearchParams(search);
        const currentControlParams = [...params.entries()].filter(([key]) =>
            key.startsWith('dateZoom.'),
        );
        const nextControlParams: Array<[string, string]> = Object.entries(
            controlGranularities,
        ).map(([uuid, grain]) => [
            `dateZoom.${uuid}`,
            grain.toString().toLowerCase(),
        ]);

        // Compare content order-independently so a deep link with interleaved
        // params doesn't trigger a no-op navigation just from re-appending.
        const serialize = (entries: Array<[string, string]>): string =>
            entries
                .map(([key, value]) => `${key}=${value}`)
                .sort()
                .join('&');
        if (serialize(currentControlParams) === serialize(nextControlParams)) {
            return;
        }

        currentControlParams.forEach(([key]) => params.delete(key));
        nextControlParams.forEach(([key, value]) => params.set(key, value));

        void navigate(
            { pathname, search: params.toString() },
            { replace: true },
        );
    }, [controlGranularities, search, navigate, pathname, embed.mode]);

    // Apply default date zoom granularity when dashboard loads (if no URL override).
    // Uses `searchRef` so URL changes don't re-trigger this effect — it should
    // only fire when the configured default changes (initial load + after saves).
    useEffect(() => {
        if (isEditMode) return;
        if (configDefaultDateZoomGranularity && !isDateZoomDisabledInConfig) {
            const searchParams = new URLSearchParams(searchRef.current);
            const dateZoomParam = searchParams.get('dateZoom');
            // Only apply default if no URL override is present
            if (!dateZoomParam) {
                dispatch(
                    dashboardDateZoomActions.setGranularity(
                        configDefaultDateZoomGranularity,
                    ),
                );
            }
        }
    }, [
        configDefaultDateZoomGranularity,
        isDateZoomDisabledInConfig,
        isEditMode,
        dispatch,
    ]);

    // Reset dateZoomGranularity if it's not in the allowed list.
    // Falls back to the validated default state (not the raw config value,
    // which may reference a stale custom granularity).
    // Only validates standard granularities here — custom granularities
    // are validated by DashboardGranularitySync once all charts have loaded
    // and the full set of available custom granularities is known.
    // Waits for the dashboard so a URL value isn't checked against the
    // placeholder list, which leaves out sub-day granularities.
    useEffect(() => {
        if (
            isDashboardLoaded &&
            dateZoomGranularity &&
            dateZoomGranularities.length > 0 &&
            isStandardDateGranularity(dateZoomGranularity) &&
            !dateZoomGranularities.includes(dateZoomGranularity)
        ) {
            dispatch(
                dashboardDateZoomActions.setGranularity(
                    defaultDateZoomGranularity ?? undefined,
                ),
            );
        }
    }, [
        isDashboardLoaded,
        dateZoomGranularities,
        dateZoomGranularity,
        defaultDateZoomGranularity,
        dispatch,
    ]);

    return null;
};

export default DashboardDateZoomSync;
