import { type CreateSavedChartVersion } from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom-v5-compat';
import useToaster from './toaster/useToaster';
import { parseExplorerSearchParams } from './useExplorerRoute';

export type SqlRunnerState = {
    createSavedChart: CreateSavedChartVersion | undefined;
    sqlRunner: { sql: string } | undefined;
};

const getSqlRunnerUrlFromCreateSavedChartVersion = (
    projectUuid: string,
    sqlRunnerState: SqlRunnerState,
): { pathname: string; search: string } => {
    const newParams = new URLSearchParams();
    if (sqlRunnerState.createSavedChart) {
        newParams.set(
            'create_saved_chart_version',
            JSON.stringify(sqlRunnerState.createSavedChart),
        );
    }
    if (sqlRunnerState.sqlRunner) {
        newParams.set('sql_runner', JSON.stringify(sqlRunnerState.sqlRunner));
    }
    return {
        pathname: `/projects/${projectUuid}/sqlRunner`,
        search: newParams.toString(),
    };
};

export const useSqlRunnerRoute = (sqlRunnerState: SqlRunnerState) => {
    const navigate = useNavigate();
    const pathParams = useParams<{
        projectUuid: string;
    }>();

    useEffect(() => {
        if (sqlRunnerState) {
            navigate(
                getSqlRunnerUrlFromCreateSavedChartVersion(
                    pathParams.projectUuid,
                    sqlRunnerState,
                ),
                { replace: true },
            );
        }
    }, [sqlRunnerState, navigate, pathParams.projectUuid]);
};

export const useSqlRunnerUrlState = (): SqlRunnerState | undefined => {
    const { showToastError } = useToaster();
    const { search } = useLocation();

    return useMemo(() => {
        try {
            const searchParams = new URLSearchParams(search);
            const sqlRunnerSearchParam = searchParams.get('sql_runner');
            const sqlRunner = sqlRunnerSearchParam
                ? JSON.parse(sqlRunnerSearchParam)
                : undefined;
            const createSavedChart = parseExplorerSearchParams(search);

            return {
                createSavedChart,
                sqlRunner,
            };
        } catch (e: any) {
            showToastError({ title: 'Error parsing url', subtitle: e });
        }
    }, [search, showToastError]);
};
