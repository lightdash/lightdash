import { ApiError, Dashboard, DashboardTileTypes, SavedQuery } from 'common';
import { v4 as uuid4 } from 'uuid';
import { useMutation } from 'react-query';
import { createSavedQuery, updateSavedQuery } from './useSavedQuery';
import { createDashboard, updateDashboard } from './dashboard/useDashboard';
import { useApp } from '../providers/AppProvider';

type AddSavedQueryToDashboardProps = {
    savedQueryUuid: string | undefined;
    projectUuid: string;
    queryData: Omit<SavedQuery, 'uuid'>;
    selectedDashboards: Dashboard[];
};

export const addSavedQueryToDashboard = async ({
    projectUuid,
    savedQueryUuid,
    queryData,
    selectedDashboards,
}: AddSavedQueryToDashboardProps) => {
    let savedQuery: SavedQuery;
    if (savedQueryUuid) {
        // update query
        savedQuery = await updateSavedQuery(savedQueryUuid, queryData);
    } else {
        savedQuery = await createSavedQuery(projectUuid, queryData);
    }

    // add saved query to the selected dashboards
    const newTile = {
        uuid: uuid4(),
        properties: { savedChartUuid: savedQuery.uuid },
        type: DashboardTileTypes.SAVED_CHART,
        h: 3,
        w: 5,
        x: 0,
        y: 0,
    };
    if (selectedDashboards) {
        const updateDashboardPromises = selectedDashboards.map(
            ({ uuid, tiles }) =>
                updateDashboard(uuid, { tiles: [...tiles, newTile] }),
        );
        return Promise.all(updateDashboardPromises);
    }
    //  create a new dashboard
    return createDashboard(projectUuid, {
        name: 'Edit untitled dashboard...',
        tiles: [newTile],
    });
};

export const useCreateUpdateDashboardWithQuery = () => {
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<
        Dashboard | undefined[] | Dashboard,
        ApiError,
        AddSavedQueryToDashboardProps
    >((data) => addSavedQueryToDashboard(data), {
        onSuccess: async () => {
            showToastSuccess({
                title: `Query and dashboard where saved with success`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to update dashboard`,
                subtitle: error.error.message,
            });
        },
    });
};
