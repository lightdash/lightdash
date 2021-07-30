import {
    CreateSavedQuery,
    CreateSavedQueryVersion,
    SavedQuery,
    Space,
} from 'common';
import {
    addSavedQueryVersion,
    createSavedQuery,
    getSavedQueryByUuid,
    deleteSavedQuery,
} from '../database/entities/savedQueries';
import database from '../database/database';
import { getSpaceWithQueries } from '../database/entities/spaces';
import { analytics } from '../analytics/client';

export const SavedQueriesModel = {
    getAllSpaces: async (): Promise<Space[]> => {
        const space = await getSpaceWithQueries();
        return [space];
    },
    create: async (
        userUuid: string,
        savedQuery: CreateSavedQuery,
    ): Promise<SavedQuery> => {
        const newSavedQuery = await createSavedQuery(savedQuery);
        analytics.track({
            event: 'saved_query_created',
            userId: userUuid,
            properties: {
                savedQueryId: newSavedQuery.uuid,
            },
        });
        return newSavedQuery;
    },
    getById: async (savedQueryUuid: string): Promise<SavedQuery> =>
        getSavedQueryByUuid(database, savedQueryUuid),
    delete: async (userUuid: string, savedQueryUuid: string): Promise<void> => {
        await deleteSavedQuery(database, savedQueryUuid);
        analytics.track({
            event: 'saved_query_deleted',
            userId: userUuid,
            properties: {
                savedQueryId: savedQueryUuid,
            },
        });
    },
    addVersion: async (
        userUuid: string,
        savedQueryUuid: string,
        data: CreateSavedQueryVersion,
    ): Promise<SavedQuery> => {
        const savedQuery = await addSavedQueryVersion(savedQueryUuid, data);
        analytics.track({
            event: 'saved_query_version_created',
            userId: userUuid,
            properties: {
                savedQueryId: savedQuery.uuid,
            },
        });
        return savedQuery;
    },
};
