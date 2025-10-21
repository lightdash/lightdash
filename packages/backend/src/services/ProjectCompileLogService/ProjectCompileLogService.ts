import { subject } from '@casl/ability';
import {
    CompilationSource,
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    type ProjectCompileLog,
    type SessionUser,
} from '@lightdash/common';
import {
    DbProjectCompileLogSortColumns,
    ProjectCompileLogModel,
} from '../../models/ProjectCompileLogModel';
import { BaseService } from '../BaseService';

type ProjectCompileLogServiceArguments = {
    projectCompileLogModel: ProjectCompileLogModel;
};

export class ProjectCompileLogService extends BaseService {
    private readonly projectCompileLogModel: ProjectCompileLogModel;

    constructor({ projectCompileLogModel }: ProjectCompileLogServiceArguments) {
        super();
        this.projectCompileLogModel = projectCompileLogModel;
    }

    async getProjectCompileLogs(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        sort?: {
            column: DbProjectCompileLogSortColumns;
            direction: 'asc' | 'desc';
        },
        filters?: {
            triggeredByUserUuids?: string[];
            source?: CompilationSource;
        },
    ): Promise<KnexPaginatedData<ProjectCompileLog[]>> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError(
                'User does not have access to an organization',
            );
        }

        if (
            user.ability.cannot(
                'update',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.projectCompileLogModel.getLogs({
            organizationUuid,
            projectUuid,
            paginateArgs,
            sort,
            filters,
        });
    }

    async getProjectCompileLogByJob(
        user: SessionUser,
        projectUuid: string,
        jobUuid: string,
    ): Promise<ProjectCompileLog | undefined> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError(
                'User does not have access to an organization',
            );
        }

        if (
            user.ability.cannot(
                'update',
                subject('Project', { organizationUuid, projectUuid }),
            ) ||
            user.ability.cannot(
                'view',
                subject('JobStatus', {
                    organizationUuid,
                    jobUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.projectCompileLogModel.getByJob(projectUuid, jobUuid);
    }
}
