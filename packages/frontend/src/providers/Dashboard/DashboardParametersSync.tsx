import { isEqual } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    dashboardParametersActions,
    selectDashboardEffectiveParameterValues,
    selectDashboardParameterReferences,
    selectEmbedDashboard,
    selectParameterControlPicks,
    selectParameterControls,
    selectParameterPicks,
    selectParameterTilePicks,
    selectParameterValues,
    selectSavedParameters,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../features/dashboard/store';
import { useParameters } from '../../features/parameters';
import {
    getDashboardParameterOverrides,
    getPickedParameterOverrides,
} from './dashboardParametersUrl';

type Props = {
    projectUuid: string | undefined;
    isEditMode: boolean;
};

/**
 * Keeps runtime parameter overrides in the URL and loads definitions for the
 * parameters the tiles reference. Renders nothing.
 */
const DashboardParametersSync: FC<Props> = ({ projectUuid, isEditMode }) => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();
    const embed = useEmbed();
    const dispatch = useDashboardDispatch();

    const parameterValues = useDashboardSelector(selectParameterValues);
    const savedParameters = useDashboardSelector(selectSavedParameters);
    const parameterControls = useDashboardSelector(selectParameterControls);
    const parameterPicks = useDashboardSelector(selectParameterPicks);
    const dashboardParameterReferences = useDashboardSelector(
        selectDashboardParameterReferences,
    );

    // Keep runtime parameter overrides in shared dashboard URLs. Saved defaults
    // are omitted so unchanged dashboards keep clean, stable URLs.
    useEffect(() => {
        if (embed.mode === 'sdk' || isEditMode) return;

        const currentParams = new URLSearchParams(search);
        const newParams = new URLSearchParams(search);
        const overrides =
            parameterControls === null
                ? getDashboardParameterOverrides(
                      parameterValues,
                      savedParameters,
                  )
                : getPickedParameterOverrides(parameterPicks);

        if (Object.keys(overrides).length === 0) {
            newParams.delete('parameters');
        } else {
            newParams.set('parameters', JSON.stringify(overrides));
        }

        if (newParams.toString() !== currentParams.toString()) {
            void navigate(
                { pathname, search: newParams.toString() },
                { replace: true },
            );
        }
    }, [
        embed.mode,
        isEditMode,
        navigate,
        parameterControls,
        parameterPicks,
        parameterValues,
        pathname,
        savedParameters,
        search,
    ]);

    // Tell an embedding host when the viewer changes a parameter: when what
    // they chose changes, not while loading fills the values in. The token's
    // own values count as chosen by the host, not the viewer.
    const { dispatchEmbedEvent } = embed;
    const effectiveParameterValues = useDashboardSelector(
        selectDashboardEffectiveParameterValues,
    );
    const parameterControlPicks = useDashboardSelector(
        selectParameterControlPicks,
    );
    const parameterTilePicks = useDashboardSelector(selectParameterTilePicks);
    const tokenParameterValues = useDashboardSelector(
        (state) => selectEmbedDashboard(state)?.parameterInteractivity?.values,
    );
    const viewerChoices = useMemo(
        () =>
            JSON.stringify([
                parameterControls === null
                    ? getDashboardParameterOverrides(
                          parameterValues,
                          savedParameters,
                      )
                    : Object.fromEntries(
                          Object.entries(
                              getPickedParameterOverrides(parameterPicks),
                          ).filter(
                              ([key, value]) =>
                                  !isEqual(tokenParameterValues?.[key], value),
                          ),
                      ),
                parameterControlPicks,
                parameterTilePicks,
            ]),
        [
            parameterControls,
            parameterValues,
            savedParameters,
            parameterPicks,
            tokenParameterValues,
            parameterControlPicks,
            parameterTilePicks,
        ],
    );
    const previousViewerChoicesRef = useRef<string | null>(null);
    useEffect(() => {
        if (isEditMode) {
            previousViewerChoicesRef.current = null;
            return;
        }
        const previous = previousViewerChoicesRef.current;
        previousViewerChoicesRef.current = viewerChoices;
        if (previous !== null && previous !== viewerChoices) {
            dispatchEmbedEvent(LightdashEventType.ParameterChanged, {
                parameters: effectiveParameterValues,
            });
        }
        // Only a change in the viewer's choices sends the event
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewerChoices, isEditMode]);

    const referencedParameterNames = useMemo(
        () => Array.from(dashboardParameterReferences),
        [dashboardParameterReferences],
    );
    const { data: projectParameters } = useParameters(
        projectUuid,
        referencedParameterNames,
        { enabled: !!projectUuid },
    );

    useEffect(() => {
        if (projectParameters) {
            dispatch(
                dashboardParametersActions.addParameterDefinitions(
                    projectParameters,
                ),
            );
        }
    }, [projectParameters, dispatch]);

    return null;
};

export default DashboardParametersSync;
