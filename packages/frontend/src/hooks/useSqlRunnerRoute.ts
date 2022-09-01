import { CreateSavedChartVersion } from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import useToaster from './toaster/useToaster';
import { parseExplorerSearchParams } from './useExplorerRoute';

export type SqlRunnerState = {
    createSavedChart: CreateSavedChartVersion | undefined;
    sqlRunner: { sql: string } | undefined;
};

export const getSqlRunnerUrlFromCreateSavedChartVersion = (
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
    const history = useHistory();
    const pathParams = useParams<{
        projectUuid: string;
    }>();

    useEffect(() => {
        if (sqlRunnerState) {
            history.replace(
                getSqlRunnerUrlFromCreateSavedChartVersion(
                    pathParams.projectUuid,
                    sqlRunnerState,
                ),
            );
        }
    }, [sqlRunnerState, history, pathParams.projectUuid]);
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
