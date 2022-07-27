import { subject } from '@casl/ability';
import { ForbiddenError, SearchResults, SessionUser } from '@lightdash/common';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SearchModel } from '../../models/SearchModel';

type Dependencies = {
    searchModel: SearchModel;
    projectModel: ProjectModel;
};

export class SearchService {
    private readonly searchModel: SearchModel;

    private readonly projectModel: ProjectModel;

    constructor(dependencies: Dependencies) {
        this.searchModel = dependencies.searchModel;
        this.projectModel = dependencies.projectModel;
    }

    async getSearchResults(
        user: SessionUser,
        projectUuid: string,
        query: string,
    ): Promise<SearchResults> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.searchModel.search(projectUuid, query);
    }
}
