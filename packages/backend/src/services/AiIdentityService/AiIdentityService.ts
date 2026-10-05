import { subject } from '@casl/ability';
import {
    Account,
    AiAccessForUser,
    AiIdentity,
    AiIdentityAccount,
    AiIdentityBulkTestRequest,
    AiIdentityDetail,
    AiIdentityExportRequest,
    AiIdentityFilter,
    AiIdentityJob,
    AiIdentityJobKind,
    AiIdentityJobStatus,
    AiIdentityListResult,
    AiIdentitySort,
    AiIdentityState,
    AiIdentityStatus,
    buildAiIdentityFixSql,
    buildAiTwinProvisioningSql,
    classifyAiIdentityFailure,
    FeatureFlags,
    fillAiTwinName,
    ForbiddenError,
    getAiIdentityPersonMessage,
    normalizeSnowflakeAccount,
    NotFoundError,
    ParameterError,
    SCHEDULER_TASKS,
    SNOWFLAKE_LOGIN_PLACEHOLDER,
    WarehouseTypes,
} from '@lightdash/common';
import { FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { AiIdentityModel } from '../../models/AiIdentityModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { generateAiIdentityKeyPair } from '../../utils/aiIdentityKeys';
import { BaseService } from '../BaseService';
import {
    buildAiTwinCredentials,
    checkAiTwinConnection,
} from './aiTwinConnection';
import { getSnowflakeLogin } from './snowflakeLogin';

const forEachSequential = async <T>(
    items: Iterable<T>,
    callback: (item: T) => Promise<void>,
): Promise<void> => {
    await [...items].reduce(
        (previous, item) => previous.then(() => callback(item)),
        Promise.resolve(),
    );
};

export class AiIdentityService extends BaseService {
    constructor(
        private readonly args: {
            aiIdentityModel: AiIdentityModel;
            projectModel: ProjectModel;
            featureFlagModel: FeatureFlagModel;
            userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
            schedulerClient: Pick<SchedulerClient, 'scheduleTask'>;
            fileStorageClient: FileStorageClient;
        },
    ) {
        super();
    }

    private getOriginalConnectionCredentials(projectUuid: string) {
        return this.args.projectModel.getWarehouseCredentialsForProject(
            projectUuid,
        );
    }

    private async checkAdmin(account: Account): Promise<string> {
        const { organizationUuid } = account.organization;
        if (
            !organizationUuid ||
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        )
            throw new ForbiddenError();
        const flag = await this.args.featureFlagModel.get({
            featureFlagId: FeatureFlags.SnowflakeAiTwins,
            user: { organizationUuid },
        });
        if (!flag.enabled)
            throw new ForbiddenError('Snowflake AI identities are not enabled');
        return organizationUuid;
    }
    private async checkAccount(
        account: Account,
        aiIdentityAccountUuid: string,
    ): Promise<{
        organizationUuid: string;
        identityAccount: AiIdentityAccount;
    }> {
        const organizationUuid = await this.checkAdmin(account);
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            aiIdentityAccountUuid,
        );
        if (
            !identityAccount ||
            identityAccount.organizationUuid !== organizationUuid
        )
            throw new NotFoundError('AI identity account not found');
        return { organizationUuid, identityAccount };
    }
    private async checkIdentity(
        account: Account,
        aiIdentityUuid: string,
    ): Promise<{
        organizationUuid: string;
        identity: AiIdentity;
    }> {
        const organizationUuid = await this.checkAdmin(account);
        const identity =
            await this.args.aiIdentityModel.findByUuid(aiIdentityUuid);
        if (!identity) throw new NotFoundError('AI identity not found');
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            identity.aiIdentityAccountUuid,
        );
        if (identityAccount?.organizationUuid !== organizationUuid)
            throw new NotFoundError('AI identity not found');
        return { organizationUuid, identity };
    }
    private async log(
        account: Account,
        organizationUuid: string,
        action: string,
        aiIdentityAccountUuid: string | null,
        aiIdentityUuid: string | null,
        targetCount = 1,
    ): Promise<void> {
        await this.args.aiIdentityModel.addEvent({
            organizationUuid,
            aiIdentityAccountUuid,
            aiIdentityUuid,
            actorType:
                account.isPatUser() || account.isServiceAccount()
                    ? 'api'
                    : 'user',
            actorUserUuid: account.user.id ?? null,
            action,
            targetCount,
            status: 'success',
            detail: null,
        });
    }
    private async projectForAccount(
        organizationUuid: string,
        snowflakeAccount: string,
    ): Promise<{
        projectUuid: string;
        credentials: Extract<
            Awaited<
                ReturnType<ProjectModel['getWarehouseCredentialsForProject']>
            >,
            { type: WarehouseTypes.SNOWFLAKE }
        >;
    }> {
        const projects =
            await this.args.projectModel.getAllByOrganizationUuid(
                organizationUuid,
            );
        const connections = await Promise.all(
            projects
                .filter(
                    (project) =>
                        project.warehouseType === WarehouseTypes.SNOWFLAKE,
                )
                .map(async (project) => ({
                    projectUuid: project.projectUuid,
                    credentials: await this.getOriginalConnectionCredentials(
                        project.projectUuid,
                    ),
                })),
        );
        const connection = connections.find(
            ({ credentials }) =>
                credentials.type === WarehouseTypes.SNOWFLAKE &&
                normalizeSnowflakeAccount(credentials.account) ===
                    snowflakeAccount,
        );
        if (connection?.credentials.type === WarehouseTypes.SNOWFLAKE)
            return {
                projectUuid: connection.projectUuid,
                credentials: connection.credentials,
            };
        throw new NotFoundError('Snowflake account has no project');
    }
    async getAccounts(account: Account): Promise<AiIdentityAccount[]> {
        const organizationUuid = await this.checkAdmin(account);
        const projects =
            await this.args.projectModel.getAllByOrganizationUuid(
                organizationUuid,
            );
        await forEachSequential(
            projects.filter(
                (project) => project.warehouseType === WarehouseTypes.SNOWFLAKE,
            ),
            async (project) => {
                const credentials = await this.getOriginalConnectionCredentials(
                    project.projectUuid,
                );
                if (credentials.type === WarehouseTypes.SNOWFLAKE)
                    await this.args.aiIdentityModel.getOrCreateAccount(
                        organizationUuid,
                        normalizeSnowflakeAccount(credentials.account),
                    );
            },
        );
        const accounts =
            await this.args.aiIdentityModel.listAccounts(organizationUuid);
        await this.log(
            account,
            organizationUuid,
            'list',
            null,
            null,
            accounts.length,
        );
        return accounts;
    }
    async updateAccount(
        account: Account,
        aiIdentityAccountUuid: string,
        twinNameTemplate: string | null,
    ): Promise<AiIdentityAccount> {
        const { organizationUuid } = await this.checkAccount(
            account,
            aiIdentityAccountUuid,
        );
        if (
            twinNameTemplate !== null &&
            (!twinNameTemplate.includes(SNOWFLAKE_LOGIN_PLACEHOLDER) ||
                !/^[A-Za-z0-9_$]+$/.test(
                    fillAiTwinName(twinNameTemplate, 'LOGIN'),
                ))
        )
            throw new ParameterError(
                'AI user name template must contain {snowflake_login} and use only letters, numbers, _ or $',
            );
        const result = await this.args.aiIdentityModel.updateAccountTemplate(
            aiIdentityAccountUuid,
            twinNameTemplate,
        );
        await this.log(
            account,
            organizationUuid,
            'update_template',
            aiIdentityAccountUuid,
            null,
        );
        return result;
    }
    async list(
        account: Account,
        filter: AiIdentityFilter,
        sort: AiIdentitySort,
        order: 'asc' | 'desc',
        page: number,
        pageSize: number,
    ): Promise<AiIdentityListResult> {
        const { organizationUuid } = await this.checkAccount(
            account,
            filter.aiIdentityAccountUuid,
        );
        const result = await this.args.aiIdentityModel.list(
            filter,
            sort,
            order,
            page,
            pageSize,
        );
        await this.log(
            account,
            organizationUuid,
            'list',
            filter.aiIdentityAccountUuid,
            null,
            result.pagination.totalResults,
        );
        return result;
    }
    async getDetail(
        account: Account,
        aiIdentityUuid: string,
    ): Promise<AiIdentityDetail> {
        const { organizationUuid, identity } = await this.checkIdentity(
            account,
            aiIdentityUuid,
        );
        const [events, list] = await Promise.all([
            this.args.aiIdentityModel.listEvents(
                organizationUuid,
                1,
                20,
                aiIdentityUuid,
            ),
            this.args.aiIdentityModel.list(
                {
                    aiIdentityAccountUuid: identity.aiIdentityAccountUuid,
                    states: [],
                    reasons:
                        identity.failureReason === null
                            ? []
                            : [identity.failureReason],
                    projectUuid: null,
                    search: null,
                    staleOnly: false,
                },
                AiIdentitySort.SEVERITY,
                'asc',
                1,
                1,
            ),
        ]);
        await this.log(
            account,
            organizationUuid,
            'list',
            identity.aiIdentityAccountUuid,
            aiIdentityUuid,
        );
        return {
            identity,
            fixSql:
                identity.failureReason === null
                    ? null
                    : buildAiIdentityFixSql({
                          reason: identity.failureReason,
                          twinName: identity.twinName,
                          publicKey: identity.publicKey,
                          roleForTwin: null,
                      }),
            sameReasonCount: Math.max(0, list.pagination.totalResults - 1),
            history: events.data,
        };
    }
    async updateIdentity(
        account: Account,
        aiIdentityUuid: string,
        twinNameOverride: string | null,
    ): Promise<AiIdentity> {
        const { organizationUuid, identity } = await this.checkIdentity(
            account,
            aiIdentityUuid,
        );
        if (
            twinNameOverride !== null &&
            !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(twinNameOverride)
        )
            throw new ParameterError(
                'AI user name must use only letters, numbers, _ or $',
            );
        let updated = await this.args.aiIdentityModel.setTwinNameOverride(
            aiIdentityUuid,
            twinNameOverride,
        );
        if (updated.twinName !== null && updated.publicKey === null)
            updated = await this.args.aiIdentityModel.setKeys(
                aiIdentityUuid,
                generateAiIdentityKeyPair(),
            );
        await this.log(
            account,
            organizationUuid,
            'update_override',
            identity.aiIdentityAccountUuid,
            aiIdentityUuid,
        );
        return updated;
    }
    async regenerateKey(
        account: Account,
        aiIdentityUuid: string,
    ): Promise<AiIdentity> {
        const { organizationUuid, identity } = await this.checkIdentity(
            account,
            aiIdentityUuid,
        );
        if (identity.twinName === null)
            throw new ParameterError('AI identity needs a Snowflake sign-in');
        const updated = await this.args.aiIdentityModel.setKeys(
            aiIdentityUuid,
            generateAiIdentityKeyPair(),
        );
        await this.log(
            account,
            organizationUuid,
            'regenerate_key',
            identity.aiIdentityAccountUuid,
            aiIdentityUuid,
        );
        return updated;
    }
    async testIdentity(
        account: Account,
        aiIdentityUuid: string,
    ): Promise<AiIdentity> {
        const { organizationUuid, identity } = await this.checkIdentity(
            account,
            aiIdentityUuid,
        );
        const result = await this.testIdentityByUuid(aiIdentityUuid);
        await this.log(
            account,
            organizationUuid,
            'test',
            identity.aiIdentityAccountUuid,
            aiIdentityUuid,
        );
        return result;
    }
    async testIdentityByUuid(aiIdentityUuid: string): Promise<AiIdentity> {
        const identity =
            await this.args.aiIdentityModel.findByUuidWithPrivateKey(
                aiIdentityUuid,
            );
        if (!identity) throw new NotFoundError('AI identity not found');
        if (identity.twinName === null || identity.privateKey === null)
            return identity;
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            identity.aiIdentityAccountUuid,
        );
        if (!identityAccount)
            throw new NotFoundError('AI identity account not found');
        const { credentials } = await this.projectForAccount(
            identityAccount.organizationUuid,
            identity.snowflakeAccount,
        );
        const result = await checkAiTwinConnection(
            buildAiTwinCredentials({
                projectCredentials: credentials,
                twinName: identity.twinName,
                privateKey: identity.privateKey,
            }),
        );
        return this.args.aiIdentityModel.updateStatus(aiIdentityUuid, {
            status: result.ok
                ? AiIdentityStatus.READY
                : AiIdentityStatus.FAILED,
            failureReason: result.ok
                ? null
                : classifyAiIdentityFailure(result.message),
            statusMessage: result.ok ? null : result.message,
        });
    }
    private async queueJob(
        account: Account,
        kind: AiIdentityJobKind,
        filter: AiIdentityFilter,
        format: 'json' | 'sql' | 'csv' | null,
        roleForTwin: string | null,
        action: string,
    ): Promise<AiIdentityJob> {
        const { organizationUuid } = await this.checkAccount(
            account,
            filter.aiIdentityAccountUuid,
        );
        const job = await this.args.aiIdentityModel.createJob({
            organizationUuid,
            aiIdentityAccountUuid: filter.aiIdentityAccountUuid,
            kind,
            filter,
            format,
            roleForTwin,
            createdByUserUuid: account.user.id ?? null,
        });
        try {
            await this.args.schedulerClient.scheduleTask(
                SCHEDULER_TASKS.AI_IDENTITY_JOB,
                { jobUuid: job.jobUuid },
            );
        } catch (error) {
            const detail =
                error instanceof Error ? error.message : String(error);
            await this.args.aiIdentityModel.updateJob(job.jobUuid, {
                status: AiIdentityJobStatus.FAILED,
                error: detail,
            });
            await this.args.aiIdentityModel.addEvent({
                organizationUuid,
                aiIdentityAccountUuid: filter.aiIdentityAccountUuid,
                aiIdentityUuid: null,
                actorType:
                    account.isPatUser() || account.isServiceAccount()
                        ? 'api'
                        : 'user',
                actorUserUuid: account.user.id,
                action,
                targetCount: 0,
                status: 'error',
                detail,
            });
            throw error;
        }
        await this.log(
            account,
            organizationUuid,
            action,
            filter.aiIdentityAccountUuid,
            null,
        );
        return job;
    }
    async bulkTest(
        account: Account,
        request: AiIdentityBulkTestRequest,
    ): Promise<AiIdentityJob> {
        return this.queueJob(
            account,
            AiIdentityJobKind.TEST,
            request.filter,
            null,
            null,
            'bulk_test',
        );
    }
    async export(
        account: Account,
        request: AiIdentityExportRequest,
    ): Promise<AiIdentityJob> {
        if (
            request.roleForTwin !== null &&
            !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(request.roleForTwin)
        )
            throw new ParameterError('Invalid Snowflake role');
        return this.queueJob(
            account,
            AiIdentityJobKind.EXPORT,
            request.filter,
            request.format,
            request.roleForTwin,
            'export',
        );
    }
    async sync(
        account: Account,
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityJob> {
        return this.queueJob(
            account,
            AiIdentityJobKind.SYNC,
            {
                aiIdentityAccountUuid,
                states: [],
                reasons: [],
                projectUuid: null,
                search: null,
                staleOnly: false,
            },
            null,
            null,
            'sync',
        );
    }
    async getJob(account: Account, jobUuid: string): Promise<AiIdentityJob> {
        const organizationUuid = await this.checkAdmin(account);
        const job = await this.args.aiIdentityModel.getJob(jobUuid);
        if (!job || job.organizationUuid !== organizationUuid)
            throw new NotFoundError('AI identity job not found');
        await this.log(
            account,
            organizationUuid,
            'list',
            job.aiIdentityAccountUuid,
            null,
        );
        return job;
    }
    async getRequestLog(account: Account, page: number, pageSize: number) {
        const organizationUuid = await this.checkAdmin(account);
        const result = await this.args.aiIdentityModel.listEvents(
            organizationUuid,
            page,
            pageSize,
        );
        await this.log(account, organizationUuid, 'list', null, null);
        return result;
    }
    async getAiAccessForUser({
        account,
        projectUuid,
    }: {
        account: Account;
        projectUuid: string;
    }): Promise<AiAccessForUser> {
        const project = await this.args.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        )
            throw new ForbiddenError();
        const restrictionsFlag = await this.args.featureFlagModel.get({
            featureFlagId: FeatureFlags.AiAccessRestrictions,
            user: {
                organizationUuid: project.organizationUuid,
                userUuid: account.user.id,
            },
        });
        const restrictionsOn =
            restrictionsFlag.enabled &&
            (await this.args.projectModel.getAiAccessRestrictions(projectUuid));
        const credentials =
            await this.getOriginalConnectionCredentials(projectUuid);
        const twinFlag = await this.args.featureFlagModel.get({
            featureFlagId: FeatureFlags.SnowflakeAiTwins,
            user: {
                organizationUuid: project.organizationUuid,
                userUuid: account.user.id,
            },
        });
        const aiIdentityRequired =
            restrictionsOn &&
            credentials.type === WarehouseTypes.SNOWFLAKE &&
            twinFlag.enabled;
        let identity: AiIdentity | null = null;
        if (
            aiIdentityRequired &&
            credentials.type === WarehouseTypes.SNOWFLAKE
        ) {
            const identityAccount =
                await this.args.aiIdentityModel.getOrCreateAccount(
                    project.organizationUuid,
                    normalizeSnowflakeAccount(credentials.account),
                );
            identity = await this.args.aiIdentityModel.find({
                aiIdentityAccountUuid: identityAccount.aiIdentityAccountUuid,
                userUuid: account.user.id,
            });
        }
        const state = !aiIdentityRequired
            ? null
            : (identity?.state ?? AiIdentityState.NEEDS_SIGN_IN);
        let action: AiAccessForUser['action'] = null;
        if (state === AiIdentityState.NEEDS_SIGN_IN) action = 'sign_in';
        else if (state !== null && state !== AiIdentityState.READY)
            action = 'ask_admin';
        return {
            projectUuid,
            restrictionsOn,
            warehouseType: credentials.type,
            aiIdentityRequired,
            state,
            aiIdentityName: identity?.twinName ?? null,
            lastCheckedAt: identity?.checkedAt ?? null,
            action,
            message:
                state === null || state === AiIdentityState.READY
                    ? null
                    : getAiIdentityPersonMessage(state),
            rawSqlAllowed:
                !restrictionsOn ||
                (aiIdentityRequired && state === AiIdentityState.READY),
        };
    }
    async runJob(jobUuid: string): Promise<void> {
        const job = await this.args.aiIdentityModel.getJob(jobUuid);
        if (!job) throw new NotFoundError('AI identity job not found');
        if (job.status === AiIdentityJobStatus.DONE) return;
        await this.args.aiIdentityModel.updateJob(jobUuid, {
            status: AiIdentityJobStatus.RUNNING,
        });
        try {
            if (job.kind === AiIdentityJobKind.SYNC) await this.runSync(job);
            if (job.kind === AiIdentityJobKind.TEST) await this.runTest(job);
            if (job.kind === AiIdentityJobKind.EXPORT)
                await this.runExport(job);
            await this.args.aiIdentityModel.updateJob(jobUuid, {
                status: AiIdentityJobStatus.DONE,
            });
            const finished = await this.args.aiIdentityModel.getJob(jobUuid);
            await this.args.aiIdentityModel.addEvent({
                organizationUuid: job.organizationUuid,
                aiIdentityAccountUuid: job.aiIdentityAccountUuid,
                aiIdentityUuid: null,
                actorType: 'scheduler',
                actorUserUuid: null,
                action: job.kind,
                targetCount: finished?.done ?? 0,
                status: 'success',
                detail: null,
            });
        } catch (error) {
            await this.args.aiIdentityModel.updateJob(jobUuid, {
                status: AiIdentityJobStatus.FAILED,
                error: error instanceof Error ? error.message : String(error),
            });
            await this.args.aiIdentityModel.addEvent({
                organizationUuid: job.organizationUuid,
                aiIdentityAccountUuid: job.aiIdentityAccountUuid,
                aiIdentityUuid: null,
                actorType: 'scheduler',
                actorUserUuid: null,
                action: job.kind,
                targetCount: 0,
                status: 'error',
                detail: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
    private async runTest(
        job: AiIdentityJob & { filter: AiIdentityFilter },
    ): Promise<void> {
        let afterUuid: string | null = null;
        let done = 0;
        const summary = await this.args.aiIdentityModel.list(
            job.filter,
            AiIdentitySort.SEVERITY,
            'asc',
            1,
            1,
        );
        await this.args.aiIdentityModel.updateJob(job.jobUuid, {
            total: summary.pagination.totalResults,
        });
        const checkBatch = async (): Promise<void> => {
            const ids = await this.args.aiIdentityModel.idsForFilter(
                job.filter,
                afterUuid,
                20,
            );
            if (ids.length === 0) return;
            await forEachSequential(ids, async (id) => {
                try {
                    await this.testIdentityByUuid(id);
                } catch (error) {
                    this.logger.warn('AI identity check failed', {
                        aiIdentityUuid: id,
                        error,
                    });
                }
                afterUuid = id;
                done += 1;
                await this.args.aiIdentityModel.updateJob(job.jobUuid, {
                    done,
                });
            });
            await checkBatch();
        };
        await checkBatch();
        if (
            job.filter.states.length === 0 &&
            job.filter.reasons.length === 0 &&
            job.filter.projectUuid === null &&
            job.filter.search === null &&
            !job.filter.staleOnly
        ) {
            await this.args.aiIdentityModel.setLastFullCheck(
                job.filter.aiIdentityAccountUuid,
            );
        }
    }
    private async runExport(
        job: AiIdentityJob & {
            filter: AiIdentityFilter;
            format: 'json' | 'sql' | 'csv' | null;
            roleForTwin: string | null;
        },
    ): Promise<void> {
        const identities: AiIdentity[] = [];
        const loadPage = async (page: number): Promise<void> => {
            const result = await this.args.aiIdentityModel.list(
                job.filter,
                AiIdentitySort.NAME,
                'asc',
                page,
                100,
            );
            identities.push(...result.data);
            if (
                identities.length < result.pagination.totalResults &&
                result.data.length > 0
            )
                await loadPage(page + 1);
        };
        await loadPage(1);
        let url: string;
        if (job.format === 'sql') {
            url = await this.args.fileStorageClient.uploadTextFile(
                Buffer.from(
                    buildAiTwinProvisioningSql({
                        identities,
                        roleForTwin: job.roleForTwin,
                    }),
                ),
                job.jobUuid,
                'sql',
            );
        } else if (job.format === 'csv') {
            const rows = identities.map((identity) =>
                [
                    identity.email,
                    identity.snowflakeLogin ?? '',
                    identity.twinName ?? '',
                    identity.state,
                    identity.failureReason ?? '',
                    identity.publicKey ?? '',
                ]
                    .map((value) => `"${value.replace(/"/g, '""')}"`)
                    .join(','),
            );
            url = await this.args.fileStorageClient.uploadCsv(
                [
                    'email,snowflake_login,ai_identity,state,failure_reason,public_key',
                    ...rows,
                ].join('\n'),
                `${job.jobUuid}.csv`,
            );
        } else {
            url = await this.args.fileStorageClient.uploadTextFile(
                Buffer.from(JSON.stringify(identities)),
                job.jobUuid,
                'json',
            );
        }
        await this.args.aiIdentityModel.updateJob(job.jobUuid, {
            total: identities.length,
            done: identities.length,
            fileUrl: url,
        });
    }
    private async runSync(
        job: AiIdentityJob & {
            organizationUuid: string;
            aiIdentityAccountUuid: string;
        },
    ): Promise<void> {
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            job.aiIdentityAccountUuid,
        );
        if (!identityAccount)
            throw new NotFoundError('AI identity account not found');
        const projects = await this.args.projectModel.getAllByOrganizationUuid(
            job.organizationUuid,
        );
        const users = new Map<string, string[]>();
        await forEachSequential(projects, async (project) => {
            if (project.warehouseType !== WarehouseTypes.SNOWFLAKE) return;
            const credentials = await this.getOriginalConnectionCredentials(
                project.projectUuid,
            );
            if (
                credentials.type !== WarehouseTypes.SNOWFLAKE ||
                normalizeSnowflakeAccount(credentials.account) !==
                    identityAccount.snowflakeAccount
            )
                return;
            const members = await this.args.aiIdentityModel.getProjectMemberIds(
                {
                    projectUuid: project.projectUuid,
                    organizationUuid: job.organizationUuid,
                },
            );
            members.forEach((userUuid) =>
                users.set(userUuid, [
                    ...(users.get(userUuid) ?? []),
                    project.projectUuid,
                ]),
            );
        });
        await this.args.aiIdentityModel.upsertForUsers(
            job.aiIdentityAccountUuid,
            [...users.keys()],
        );
        await this.args.aiIdentityModel.updateJob(job.jobUuid, {
            total: users.size,
        });
        let done = 0;
        await forEachSequential(users, async ([userUuid, projectUuids]) => {
            try {
                let identity = await this.args.aiIdentityModel.find({
                    aiIdentityAccountUuid: job.aiIdentityAccountUuid,
                    userUuid,
                });
                if (identity?.snowflakeLogin === null) {
                    const findLogin = async (
                        remainingProjects: string[],
                    ): Promise<string | null> => {
                        const [projectUuid, ...rest] = remainingProjects;
                        if (projectUuid === undefined) return null;
                        const credentials =
                            await this.getOriginalConnectionCredentials(
                                projectUuid,
                            );
                        if (credentials.type === WarehouseTypes.SNOWFLAKE) {
                            try {
                                const login = await getSnowflakeLogin({
                                    projectUuid,
                                    userUuid,
                                    projectCredentials: credentials,
                                    userWarehouseCredentialsModel:
                                        this.args.userWarehouseCredentialsModel,
                                });
                                if (login !== null) return login;
                            } catch (error) {
                                this.logger.warn(
                                    'Could not read Snowflake login for AI identity',
                                    { projectUuid, userUuid, error },
                                );
                            }
                        }
                        return findLogin(rest);
                    };
                    const login = await findLogin(projectUuids);
                    if (login !== null) {
                        await this.args.aiIdentityModel.setSnowflakeLogin(
                            job.organizationUuid,
                            userUuid,
                            login,
                        );
                        identity = await this.args.aiIdentityModel.find({
                            aiIdentityAccountUuid: job.aiIdentityAccountUuid,
                            userUuid,
                        });
                    }
                }
                if (identity?.twinName !== null && identity?.publicKey === null)
                    await this.args.aiIdentityModel.setKeys(
                        identity.aiIdentityUuid,
                        generateAiIdentityKeyPair(),
                    );
            } catch (error) {
                this.logger.warn('AI identity sync failed', {
                    userUuid,
                    error,
                });
            }
            done += 1;
            await this.args.aiIdentityModel.updateJob(job.jobUuid, {
                done,
            });
        });
    }

    async scheduleDailyChecks(): Promise<void> {
        const accounts = await this.args.aiIdentityModel.listAllAccounts();
        await forEachSequential(accounts, async (account) => {
            const filter: AiIdentityFilter = {
                aiIdentityAccountUuid: account.aiIdentityAccountUuid,
                states: [],
                reasons: [],
                projectUuid: null,
                search: null,
                staleOnly: false,
            };
            const job = await this.args.aiIdentityModel.createJob({
                organizationUuid: account.organizationUuid,
                aiIdentityAccountUuid: account.aiIdentityAccountUuid,
                kind: AiIdentityJobKind.TEST,
                filter,
                format: null,
                roleForTwin: null,
                createdByUserUuid: null,
            });
            await this.args.schedulerClient.scheduleTask(
                SCHEDULER_TASKS.AI_IDENTITY_JOB,
                { jobUuid: job.jobUuid },
            );
        });
    }

    async scheduleSyncForProject(
        organizationUuid: string,
        projectUuid: string,
    ): Promise<void> {
        const credentials =
            await this.getOriginalConnectionCredentials(projectUuid);
        if (credentials.type !== WarehouseTypes.SNOWFLAKE) return;
        const identityAccount =
            await this.args.aiIdentityModel.getOrCreateAccount(
                organizationUuid,
                normalizeSnowflakeAccount(credentials.account),
            );
        const filter: AiIdentityFilter = {
            aiIdentityAccountUuid: identityAccount.aiIdentityAccountUuid,
            states: [],
            reasons: [],
            projectUuid: null,
            search: null,
            staleOnly: false,
        };
        const job = await this.args.aiIdentityModel.createJob({
            organizationUuid,
            aiIdentityAccountUuid: identityAccount.aiIdentityAccountUuid,
            kind: AiIdentityJobKind.SYNC,
            filter,
            format: null,
            roleForTwin: null,
            createdByUserUuid: null,
        });
        await this.args.schedulerClient.scheduleTask(
            SCHEDULER_TASKS.AI_IDENTITY_JOB,
            { jobUuid: job.jobUuid },
        );
    }

    async scheduleSignIn(
        organizationUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.args.schedulerClient.scheduleTask(
            SCHEDULER_TASKS.AI_IDENTITY_SIGN_IN,
            {
                organizationUuid,
                userUuid,
            },
        );
    }

    async processSignIn(
        organizationUuid: string,
        userUuid: string,
    ): Promise<void> {
        const projects =
            await this.args.projectModel.getAllByOrganizationUuid(
                organizationUuid,
            );
        let foundLogin = false;
        await forEachSequential(projects, async (project) => {
            if (
                foundLogin ||
                project.warehouseType !== WarehouseTypes.SNOWFLAKE
            )
                return;
            const credentials = await this.getOriginalConnectionCredentials(
                project.projectUuid,
            );
            if (credentials.type !== WarehouseTypes.SNOWFLAKE) return;
            try {
                const login = await getSnowflakeLogin({
                    projectUuid: project.projectUuid,
                    userUuid,
                    projectCredentials: credentials,
                    userWarehouseCredentialsModel:
                        this.args.userWarehouseCredentialsModel,
                });
                if (login === null) return;
                await this.args.aiIdentityModel.setSnowflakeLogin(
                    organizationUuid,
                    userUuid,
                    login,
                );
                const accounts =
                    await this.args.aiIdentityModel.listAccounts(
                        organizationUuid,
                    );
                await forEachSequential(accounts, async (account) => {
                    const identity = await this.args.aiIdentityModel.find({
                        aiIdentityAccountUuid: account.aiIdentityAccountUuid,
                        userUuid,
                    });
                    if (
                        identity?.twinName !== null &&
                        identity?.publicKey === null
                    )
                        await this.args.aiIdentityModel.setKeys(
                            identity.aiIdentityUuid,
                            generateAiIdentityKeyPair(),
                        );
                });
                foundLogin = true;
            } catch (error) {
                this.logger.warn(
                    'Could not read Snowflake login for AI identity',
                    { userUuid, error },
                );
            }
        });
    }
}
