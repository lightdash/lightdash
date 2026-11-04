import { useEffect, useMemo, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    dashboardParametersActions,
    selectDashboardParameterReferences,
    selectParameterValues,
    selectSavedParameters,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../features/dashboard/store';
import { useParameters } from '../../features/parameters';
import { getDashboardParameterOverrides } from './dashboardParametersUrl';

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
    const dashboardParameterReferences = useDashboardSelector(
        selectDashboardParameterReferences,
    );

    // Keep runtime parameter overrides in shared dashboard URLs. Saved defaults
    // are omitted so unchanged dashboards keep clean, stable URLs.
    useEffect(() => {
        if (embed.mode === 'sdk' || isEditMode) return;

        const currentParams = new URLSearchParams(search);
        const newParams = new URLSearchParams(search);
        const overrides = getDashboardParameterOverrides(
            parameterValues,
            savedParameters,
        );

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
        parameterValues,
        pathname,
        savedParameters,
        search,
    ]);

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
