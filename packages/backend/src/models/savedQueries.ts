import {
    CreateSavedQuery,
    CreateSavedQueryVersion,
    SavedQuery,
    Space,
    UpdateSavedQuery,
} from 'common';
import {
    addSavedQueryVersion,
    createSavedQuery,
    getSavedQueryByUuid,
    deleteSavedQuery,
    updateSavedQuery,
} from '../database/entities/savedQueries';
import database from '../database/database';
import { getSpaceWithQueries } from '../database/entities/spaces';
import { analytics } from '../analytics/client';

export const SavedQueriesModel = {
    getAllSpaces: async (projectUuid: string): Promise<Space[]> => {
        const space = await getSpaceWithQueries(projectUuid);
        return [space];
    },
    create: async (
        userUuid: string,
        projectId: string,
        organizationId: string,
        savedQuery: CreateSavedQuery,
    ): Promise<SavedQuery> => {
        const newSavedQuery = await createSavedQuery(projectId, savedQuery);
        analytics.track({
            event: 'saved_chart.created',
            projectId,
            organizationId,
            userId: userUuid,
            properties: {
                savedQueryId: newSavedQuery.uuid,
            },
        });
        return newSavedQuery;
    },
    getById: async (savedQueryUuid: string): Promise<SavedQuery> =>
        getSavedQueryByUuid(database, savedQueryUuid),
    delete: async (
        userUuid: string,
        organizationId: string,
        savedQueryUuid: string,
    ): Promise<void> => {
        await deleteSavedQuery(database, savedQueryUuid);
        analytics.track({
            event: 'saved_chart.deleted',
            userId: userUuid,
            organizationId,
            properties: {
                savedQueryId: savedQueryUuid,
            },
        });
    },
    update: async (
        userUuid: string,
        organizationId: string,
        savedQueryUuid: string,
        data: UpdateSavedQuery,
    ): Promise<SavedQuery> => {
        const savedQuery = await updateSavedQuery(savedQueryUuid, data);
        analytics.track({
            event: 'saved_chart.updated',
            userId: userUuid,
            organizationId,
            properties: {
                savedQueryId: savedQueryUuid,
            },
        });
        return savedQuery;
    },
    addVersion: async (
        userUuid: string,
        organizationId: string,
        savedQueryUuid: string,
        data: CreateSavedQueryVersion,
    ): Promise<SavedQuery> => {
        const savedQuery = await addSavedQueryVersion(savedQueryUuid, data);
        analytics.track({
            event: 'saved_chart_version.created',
            userId: userUuid,
            organizationId,
            properties: {
                savedQueryId: savedQuery.uuid,
            },
        });
        return savedQuery;
    },
};
