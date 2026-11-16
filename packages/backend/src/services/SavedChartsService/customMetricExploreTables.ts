import { isExploreError, NotFoundError, type Explore } from '@lightdash/common';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';

/** Tables for telling modelled custom metrics from hand-written ones; a missing explore has none. */
export const getCustomMetricExploreTables = async (
    projectModel: Pick<ProjectModel, 'getExploreFromCache'>,
    projectUuid: string,
    exploreName: string,
): Promise<Explore['tables']> => {
    try {
        const explore = await projectModel.getExploreFromCache(
            projectUuid,
            exploreName,
        );
        return isExploreError(explore) ? {} : explore.tables;
    } catch (error) {
        if (error instanceof NotFoundError) return {};
        throw error;
    }
};
