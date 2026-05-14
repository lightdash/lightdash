import { subject } from '@casl/ability';
import {
    CompilationSource,
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    type Account,
    type ProjectCompileLog,
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
        account: Account,
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
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError(
                'User does not have access to an organization',
            );
        }

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
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
        account: Account,
        projectUuid: string,
        jobUuid: string,
    ): Promise<ProjectCompileLog | undefined> {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError(
                'User does not have access to an organization',
            );
        }

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
            ) ||
            auditedAbility.cannot(
                'view',
                subject('JobStatus', {
                    organizationUuid,
                    jobUuid,
                    projectUuid,
                    metadata: { projectUuid, jobUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.projectCompileLogModel.getByJob(projectUuid, jobUuid);
    }
}
