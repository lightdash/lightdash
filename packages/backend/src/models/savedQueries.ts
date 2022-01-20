import {
    CreateSavedQuery,
    CreateSavedQueryVersion,
    SavedQuery,
    SessionUser,
    Space,
    UpdateSavedQuery,
} from 'common';
import { analytics } from '../analytics/client';
import database from '../database/database';
import {
    addSavedQueryVersion,
    createSavedQuery,
    deleteSavedQuery,
    getSavedQueryByUuid,
    updateSavedQuery,
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
        savedQuery: CreateSavedQuery,
    ): Promise<SavedQuery> => {
        if (user.ability.cannot('create', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const newSavedQuery = await createSavedQuery(projectUuid, savedQuery);
        analytics.track({
            event: 'saved_chart.created',
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            userId: user.userUuid,
            properties: {
                savedQueryId: newSavedQuery.uuid,
            },
        });
        return newSavedQuery;
    },

    getById: async (savedQueryUuid: string): Promise<SavedQuery> =>
        getSavedQueryByUuid(database, savedQueryUuid),

    delete: async (
        user: SessionUser,
        savedQueryUuid: string,
    ): Promise<void> => {
        if (user.ability.cannot('delete', 'SavedChart')) {
            throw new ForbiddenError();
        }
        await deleteSavedQuery(database, savedQueryUuid);
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
        data: UpdateSavedQuery,
    ): Promise<SavedQuery> => {
        if (user.ability.cannot('update', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const savedQuery = await updateSavedQuery(savedQueryUuid, data);
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
        data: CreateSavedQueryVersion,
    ): Promise<SavedQuery> => {
        if (user.ability.cannot('update', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const savedQuery = await addSavedQueryVersion(savedQueryUuid, data);
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
