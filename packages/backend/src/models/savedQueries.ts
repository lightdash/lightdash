import {
    CreateSavedChart,
    CreateSavedChartVersion,
    SavedChart,
    SessionUser,
    Space,
    UpdateSavedChart,
} from 'common';
import { analytics } from '../analytics/client';
import database from '../database/database';
import {
    addSavedChartVersion,
    createSavedChart,
    deleteSavedChart,
    getSavedChartByUuid,
    updateSavedChart,
} from '../database/entities/savedQueries';
import { getSpaceWithQueries } from '../database/entities/spaces';
import { ForbiddenError } from '../errors';

export const SavedQueriesModel = {
    getAllSpaces: async (projectUuid: string): Promise<Space[]> => {
        const space = await getSpaceWithQueries(projectUuid);
        return [space];
    },
    create: async (
        user: SessionUser,
        projectUuid: string,
        savedQuery: CreateSavedChart,
    ): Promise<SavedChart> => {
        if (user.ability.cannot('create', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const newSavedChart = await createSavedChart(projectUuid, savedQuery);
        analytics.track({
            event: 'saved_chart.created',
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            userId: user.userUuid,
            properties: {
                savedQueryId: newSavedChart.uuid,
            },
        });
        return newSavedChart;
    },

    getById: async (savedQueryUuid: string): Promise<SavedChart> =>
        getSavedChartByUuid(database, savedQueryUuid),

    delete: async (
        user: SessionUser,
        savedQueryUuid: string,
    ): Promise<void> => {
        if (user.ability.cannot('delete', 'SavedChart')) {
            throw new ForbiddenError();
        }
        await deleteSavedChart(database, savedQueryUuid);
        analytics.track({
            event: 'saved_chart.deleted',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: {
                savedQueryId: savedQueryUuid,
            },
        });
    },
    update: async (
        user: SessionUser,
        savedQueryUuid: string,
        data: UpdateSavedChart,
    ): Promise<SavedChart> => {
        if (user.ability.cannot('update', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const savedQuery = await updateSavedChart(savedQueryUuid, data);
        analytics.track({
            event: 'saved_chart.updated',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: {
                savedQueryId: savedQueryUuid,
            },
        });
        return savedQuery;
    },
    addVersion: async (
        user: SessionUser,
        savedQueryUuid: string,
        data: CreateSavedChartVersion,
    ): Promise<SavedChart> => {
        if (user.ability.cannot('update', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const savedQuery = await addSavedChartVersion(savedQueryUuid, data);
        analytics.track({
            event: 'saved_chart_version.created',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: {
                savedQueryId: savedQuery.uuid,
            },
        });
        return savedQuery;
    },
};
