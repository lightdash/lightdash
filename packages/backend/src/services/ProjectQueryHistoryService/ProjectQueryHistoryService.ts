import { subject } from '@casl/ability';
import {
    ForbiddenError,
    KnexPaginateArgs,
    type ApiProjectQueryHistoryResults,
    type KnexPaginatedData,
    type SessionUser,
} from '@lightdash/common';
import { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { BaseService } from '../BaseService';

type ProjectQueryHistoryServiceArguments = {
    queryHistoryModel: QueryHistoryModel;
};

export class ProjectQueryHistoryService extends BaseService {
    private readonly queryHistoryModel: QueryHistoryModel;

    constructor({ queryHistoryModel }: ProjectQueryHistoryServiceArguments) {
        super();
        this.queryHistoryModel = queryHistoryModel;
    }

    async getProjectQueryHistory(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<ApiProjectQueryHistoryResults>> {
        const { organizationUuid } = user;

        if (!organizationUuid) {
            throw new ForbiddenError(
                'User does not have access to an organization',
            );
        }

        if (
            user.ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const results = await this.queryHistoryModel.getProjectQueryHistory({
            organizationUuid,
            projectUuid,
            paginateArgs,
        });

        return results;
    }
}
