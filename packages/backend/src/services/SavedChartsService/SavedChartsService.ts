import { SessionUser } from 'common';
import { NotExistsError } from '../../errors';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedQueriesModel } from '../../models/savedQueries';

type Dependencies = {
    projectModel: ProjectModel;
};

export class SavedChartsService {
    projectModel: ProjectModel;

    constructor({ projectModel }: Dependencies) {
        this.projectModel = projectModel;
    }

    async hasSavedCharts(user: SessionUser): Promise<boolean> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const project = await this.projectModel.getDefaultProject(
            organizationUuid,
        );
        const spaces = await SavedQueriesModel.getAllSpaces(
            project.projectUuid,
        );

        return spaces.some((space) => space.queries.length > 0);
    }
}
