import { subject } from '@casl/ability';
import {
    Account,
    AI_IDENTITY_NAME_PLACEHOLDER,
    AI_IDENTITY_PROVISIONER_WORST_CASE,
    AI_IDENTITY_SCHEMA_CHANGED_MESSAGE,
    AI_IDENTITY_SHOW_USERS_NOTICE,
    AI_IDENTITY_SYNC_UNSAFE_MESSAGE,
    AiAccessForUser,
    AiIdentity,
    AiIdentityAccount,
    aiIdentityAutomaticSyncGate,
    aiIdentityAutomaticSyncUnsafeReason,
    AiIdentityBulkTestRequest,
    AiIdentityCreationMode,
    AiIdentityDetail,
    AiIdentityExportRequest,
    AiIdentityFailureReason,
    AiIdentityFilter,
    AiIdentityJob,
    AiIdentityJobKind,
    AiIdentityJobStatus,
    AiIdentityListResult,
    AiIdentityProvisionerFindingReason,
    AiIdentityProvisionerStatus,
    aiIdentitySnowflakeIdentifier,
    AiIdentitySort,
    AiIdentityState,
    AiIdentityStatus,
    AiIdentitySyncStatus,
    assertRegisteredAccount,
    assertUnreachable,
    buildAiIdentityAutomaticSyncSetupSql,
    buildAiIdentityFixSql,
    buildAiIdentityProvisionerCleanupSql,
    buildAiIdentityProvisionerSetupSql,
    buildAiTwinProvisioningSql,
    classifyAiIdentityFailure,
    DEFAULT_AI_IDENTITY_PROVISIONER_ROLE,
    DEFAULT_AI_IDENTITY_PROVISIONER_USER,
    expandAiIdentitySchemaRule,
    FeatureFlags,
    fillAiTwinName,
    ForbiddenError,
    getAiIdentityPersonMessage,
    getAiIdentitySetupCheckInterval,
    isValidSchemaPattern,
    matchesSchemaPattern,
    normalizeSnowflakeAccount,
    NotFoundError,
    ParameterError,
    resolveAiIdentityRole,
    SCHEDULER_TASKS,
    SNOWFLAKE_LOGIN_PLACEHOLDER,
    validateAiIdentityRoleTemplate,
    WarehouseTypes,
    type AiIdentityAiRoleDefinition,
    type AiIdentityProvisioningPlan,
    type AiIdentityProvisioningSettings,
    type AiIdentitySchemaRule,
    type AiIdentitySetupCheck,
    type AiIdentitySetupCheckItem,
    type AiIdentityUngrantedSchemas,
    type CreateAiIdentityProvisioner,
    type UpdateAiIdentityAiRoleDefinition,
    type UpdateAiIdentityRoleMapping,
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
    listAiTwinSchemas,
} from './aiTwinConnection';
import { ProvisionerConnection } from './provisionerConnection';
import {
    buildProvisioningPlan,
    classifyProvisionerUsers,
    missingProvisionerGrants,
    missingSchemas,
} from './provisioningPlan';
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

const managedScopeFor = (roles: AiIdentityAiRoleDefinition[]) =>
    roles
        .filter((role) => role.schemaRule.database)
        .map((role) => ({
            roleName: role.roleName,
            database: role.schemaRule.database,
        }));

const setupCheckFailureDetail = (
    key: string,
    cause: unknown,
    warehouse: string | null,
): string => {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/Failed to select Snowflake warehouse/i.test(message))
        return warehouse === null
            ? 'The setup role cannot use the project warehouse. Run the updated setup script.'
            : `The setup role cannot use the warehouse ${warehouse}. Run the updated setup script.`;
    if (key === 'sign_in')
        return /JWT token is invalid|does not exist|not found/i.test(message)
            ? 'The setup user cannot sign in with its key.'
            : `The setup user cannot sign in: ${message.split('\n')[0]}`;
    if (key === 'create_identities')
        return 'The setup role cannot create AI identities.';
    return `The check failed: ${message.split('\n')[0]}`;
};

export class AiIdentityService extends BaseService {
    constructor(
        private readonly args: {
            aiIdentityModel: AiIdentityModel;
            projectModel: ProjectModel;
            featureFlagModel: FeatureFlagModel;
            userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
            schedulerClient: Pick<
                SchedulerClient,
                'scheduleTask' | 'scheduleAiIdentitySetupCheck'
            >;
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

    async getProvisioningSettings(
        account: Account,
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityProvisioningSettings> {
        const { organizationUuid, identityAccount } = await this.checkAccount(
            account,
            aiIdentityAccountUuid,
        );
        const [mode, provisioner, mappings, aiRoles, identities, drops, sync] =
            await Promise.all([
                this.args.aiIdentityModel.getProvisioningMode(
                    aiIdentityAccountUuid,
                ),
                this.args.aiIdentityModel.getProvisioner(aiIdentityAccountUuid),
                this.args.aiIdentityModel.getRoleMappings(
                    aiIdentityAccountUuid,
                ),
                this.args.aiIdentityModel.getAiRoles(aiIdentityAccountUuid),
                this.args.aiIdentityModel.getProvisioningIdentities(
                    aiIdentityAccountUuid,
                ),
                this.args.aiIdentityModel.listProvisioningDrops(
                    aiIdentityAccountUuid,
                ),
                this.args.aiIdentityModel.getAutomaticSync(
                    aiIdentityAccountUuid,
                ),
            ]);
        const { projectUuid, credentials } = await this.projectForAccount(
            organizationUuid,
            identityAccount.snowflakeAccount,
        );
        let automaticSync = sync;
        if (provisioner === null)
            automaticSync = { ...sync, status: AiIdentitySyncStatus.UNSAFE };
        if (provisioner !== null) {
            try {
                const connection = new ProvisionerConnection(
                    credentials,
                    provisioner.userName,
                    provisioner.roleName,
                    provisioner.privateKey,
                    {
                        mappedRoles: new Set(),
                        lightdashCreatedUsers: new Set(),
                    },
                );
                const run = await connection.readAutomaticSync();
                if (!run.hasLog && sync.lastRunAt)
                    run.lastRunAt = sync.lastRunAt;
                run.issues.push(
                    ...(await connection.readViewDependencyWarnings()),
                );
                if (run.hasLog)
                    await this.args.aiIdentityModel.recordAutomaticSync(
                        aiIdentityAccountUuid,
                        run,
                    );
                if (
                    sync.pending &&
                    run.status === AiIdentitySyncStatus.OK &&
                    (sync.lastRunAt === null || run.lastRunAt > sync.lastRunAt)
                ) {
                    await this.args.aiIdentityModel.setAutomaticSyncPending(
                        aiIdentityAccountUuid,
                        false,
                    );
                }
                const gate = aiIdentityAutomaticSyncGate(run, new Date());
                automaticSync = {
                    ...sync,
                    ...run,
                    status: {
                        PROGRESS: AiIdentitySyncStatus.RUNNING,
                        UNSAFE: AiIdentitySyncStatus.UNSAFE,
                        OK: AiIdentitySyncStatus.OK,
                    }[gate.status],
                    unsafeReason: gate.reason,
                    pending:
                        sync.pending &&
                        !(
                            run.status === AiIdentitySyncStatus.OK &&
                            (sync.lastRunAt === null ||
                                run.lastRunAt > sync.lastRunAt)
                        ),
                };
            } catch {
                automaticSync = {
                    ...sync,
                    status:
                        sync.pending && sync.lastRunAt === null
                            ? AiIdentitySyncStatus.RUNNING
                            : AiIdentitySyncStatus.UNSAFE,
                    unsafeReason: 'no_ok_run',
                };
            }
        }
        if (automaticSync.pending)
            automaticSync = {
                ...automaticSync,
                status:
                    automaticSync.status === AiIdentitySyncStatus.RUNNING ||
                    automaticSync.lastRunAt === null
                        ? AiIdentitySyncStatus.RUNNING
                        : AiIdentitySyncStatus.UNSAFE,
            };
        const catalog =
            await this.args.aiIdentityModel.getCachedCatalogSchemas(
                projectUuid,
            );
        const aiRoleExpansions = aiRoles.map((aiRole) => ({
            roleName: aiRole.roleName,
            ...expandAiIdentitySchemaRule(aiRole.schemaRule, catalog.schemas),
            catalogLoaded: catalog.loaded,
        }));
        const mappedPeople = identities.flatMap((identity) => {
            if (identity.snowflakeLogin === null) return [];
            const mapping = mappings
                .filter((item) => identity.groupUuids.includes(item.groupUuid))
                .sort(
                    (left, right) =>
                        left.priority - right.priority ||
                        left.groupUuid.localeCompare(right.groupUuid),
                )[0];
            if (!mapping) return [];
            return [
                {
                    identity,
                    snowflakeLogin: identity.snowflakeLogin,
                    roleName: mapping.aiRole,
                    groupName: mapping.groupName,
                },
            ];
        });
        const ownSchemas =
            await this.args.aiIdentityModel.getCachedCatalogSchemasForPeople(
                projectUuid,
                mappedPeople.map(({ identity, snowflakeLogin }) => ({
                    userUuid: identity.userUuid,
                    snowflakeLogin,
                })),
            );
        const beyondOwnAccessWarnings = mappedPeople.flatMap(
            ({ identity, roleName, groupName }) => {
                const own = ownSchemas.get(identity.userUuid);
                if (!own) return [];
                const expansion = aiRoleExpansions.find(
                    (item) =>
                        item.roleName.toUpperCase() === roleName.toUpperCase(),
                );
                if (!expansion) return [];
                const ownNames = new Set(
                    own.map((schema) => schema.toUpperCase()),
                );
                const schemas = expansion.allowed.filter(
                    (schema) => !ownNames.has(schema.toUpperCase()),
                );
                return schemas.length === 0
                    ? []
                    : [
                          {
                              roleName,
                              userUuid: identity.userUuid,
                              email: identity.email,
                              groupName,
                              schemas,
                          },
                      ];
            },
        );
        const effectiveMode =
            mode === AiIdentityCreationMode.AUTOMATIC &&
            provisioner?.status === AiIdentityProvisionerStatus.READY
                ? AiIdentityCreationMode.AUTOMATIC
                : AiIdentityCreationMode.GUIDED;
        const fallbackReason =
            mode === AiIdentityCreationMode.AUTOMATIC &&
            effectiveMode === AiIdentityCreationMode.GUIDED
                ? `Lightdash pauses automatic creation until the setup check passes. ${(provisioner?.statusMessage ?? 'The setup is not ready.').replace(/\.*$/, '.')}`
                : null;
        const setupCheck = provisioner?.setupCheck ?? null;
        const syncTotal = aiRoleExpansions.reduce(
            (count, expansion) => count + expansion.allowed.length,
            0,
        );
        const syncRoleNames = aiRoles.map((role) => role.roleName).join(', ');
        const currentSetupCheck = setupCheck && {
            ...setupCheck,
            checks: setupCheck.checks.map((check): AiIdentitySetupCheckItem => {
                if (check.key === 'sync_installed')
                    return {
                        ...check,
                        status:
                            automaticSync.lastRunAt !== null
                                ? 'passed'
                                : 'pending',
                        detail: null,
                    };
                if (check.key === 'first_sync') {
                    let status: AiIdentitySetupCheckItem['status'] = 'pending';
                    let detail: string | null = null;
                    if (
                        automaticSync.status === AiIdentitySyncStatus.OK &&
                        automaticSync.lastRunAt !== null
                    )
                        status = 'passed';
                    else if (
                        automaticSync.status === AiIdentitySyncStatus.UNSAFE
                    ) {
                        status = 'failed';
                        detail = 'Check the latest grant sync run.';
                    } else if (
                        automaticSync.status === AiIdentitySyncStatus.RUNNING
                    )
                        detail = `${Math.min(automaticSync.progress, syncTotal)} of ${syncTotal} schemas`;
                    return {
                        ...check,
                        label: `The first grant sync is complete: ${syncRoleNames || 'the AI role'} can read ${syncTotal} ${syncTotal === 1 ? 'schema' : 'schemas'}`,
                        status,
                        detail,
                    };
                }
                return check;
            }),
        };
        return {
            aiIdentityAccountUuid,
            mode,
            effectiveMode,
            fallbackReason,
            provisioner:
                provisioner === null
                    ? null
                    : {
                          aiIdentityAccountUuid,
                          userName: provisioner.userName,
                          roleName: provisioner.roleName,
                          publicKey: provisioner.publicKey,
                          publicKeyFingerprint:
                              provisioner.publicKeyFingerprint,
                          status: provisioner.status,
                          statusMessage: provisioner.statusMessage,
                          checkedAt: provisioner.checkedAt,
                          setupCheck: currentSetupCheck,
                          firstRunApprovedAt: provisioner.firstRunApprovedAt,
                          firstRunApprovedByName:
                              provisioner.firstRunApprovedByName,
                      },
            setupSql:
                provisioner === null
                    ? null
                    : [
                          buildAiIdentityProvisionerSetupSql({
                              userName: provisioner.userName,
                              roleName: provisioner.roleName,
                              publicKey: provisioner.publicKey,
                              aiRoles: aiRoles.map((aiRole, index) => ({
                                  ...aiRole,
                                  allowedSchemas:
                                      aiRoleExpansions[index].allowed,
                                  excludedSchemas:
                                      aiRoleExpansions[index].excluded,
                              })),
                              catalogLoaded: catalog.loaded,
                              existingAiRoles: mappings.map(
                                  (mapping) => mapping.aiRole,
                              ),
                          }),
                          buildAiIdentityAutomaticSyncSetupSql({
                              managedScope: managedScopeFor(aiRoles),
                              managedRules: aiRoles
                                  .filter((role) => role.schemaRule.database)
                                  .map((role) => ({
                                      roleName: role.roleName,
                                      database: role.schemaRule.database,
                                      excludePatterns:
                                          role.schemaRule.excludePatterns,
                                  })),
                              provisionerRole: provisioner.roleName,
                              warehouse: credentials.warehouse,
                          }),
                      ].join('\n'),
            cleanupSql:
                provisioner === null
                    ? null
                    : buildAiIdentityProvisionerCleanupSql({
                          userName: provisioner.userName,
                          roleName: provisioner.roleName,
                          aiUserNames: [
                              ...identities
                                  .filter(
                                      (identity) =>
                                          identity.createdByProvisioner,
                                  )
                                  .map(
                                      (identity) =>
                                          identity.provisionedUserName,
                                  )
                                  .filter(
                                      (name): name is string => name !== null,
                                  ),
                              ...drops.map((drop) => drop.userName),
                          ],
                      }),
            aiRoles,
            catalogProjectUuid: projectUuid,
            defaultWarehouse: credentials.warehouse,
            mappings,
            findings: provisioner?.findings ?? [],
            aiRoleExpansions,
            ungrantedSchemas: (provisioner?.ungrantedSchemas ?? []).flatMap(
                (item) => {
                    const role = aiRoles.find(
                        (entry) =>
                            entry.roleName.toUpperCase() ===
                            item.roleName.toUpperCase(),
                    );
                    const schemas = item.schemas.filter((schema) => {
                        const [database, name] = schema.split('.');
                        return (
                            role &&
                            database?.toUpperCase() ===
                                role.schemaRule.database.toUpperCase() &&
                            !matchesSchemaPattern(
                                name,
                                role.schemaRule.excludePatterns,
                            )
                        );
                    });
                    return schemas.length > 0
                        ? [{ roleName: item.roleName, schemas }]
                        : [];
                },
            ),
            worstCaseNotice: AI_IDENTITY_PROVISIONER_WORST_CASE,
            showUsersNotice: AI_IDENTITY_SHOW_USERS_NOTICE,
            automaticSync,
            beyondOwnAccessWarnings,
        };
    }

    private async syncAutomaticRules(
        aiIdentityAccountUuid: string,
        connection: ProvisionerConnection,
        previousRoles: AiIdentityAiRoleDefinition[] = [],
    ): Promise<void> {
        const roles = await this.args.aiIdentityModel.getAiRoles(
            aiIdentityAccountUuid,
        );
        const changedRoles = previousRoles.filter(
            (previous) =>
                !roles.some(
                    (current) =>
                        current.roleName.toUpperCase() ===
                            previous.roleName.toUpperCase() &&
                        current.warehouse.toUpperCase() ===
                            previous.warehouse.toUpperCase() &&
                        JSON.stringify(current.schemaRule) ===
                            JSON.stringify(previous.schemaRule),
                ),
        );
        await forEachSequential(changedRoles, async (role) => {
            if (!role.schemaRule.database) return;
            await connection.execute({
                kind: 'disable_rule',
                roleName: role.roleName,
                databases: [role.schemaRule.database],
            });
        });
        await forEachSequential(roles, async (role) => {
            await connection.execute({
                kind: 'write_rule',
                roleName: role.roleName,
                warehouse: role.warehouse,
                schemaRule: role.schemaRule,
            });
        });
    }

    async updateProvisioningMode(
        account: Account,
        aiIdentityAccountUuid: string,
        mode: AiIdentityCreationMode,
    ): Promise<AiIdentityProvisioningSettings> {
        const settings = await this.getProvisioningSettings(
            account,
            aiIdentityAccountUuid,
        );
        if (
            mode === AiIdentityCreationMode.AUTOMATIC &&
            settings.provisioner?.status !== AiIdentityProvisionerStatus.READY
        ) {
            throw new ParameterError(
                'Verify the Snowflake provisioner before enabling automatic AI identities.',
            );
        }
        await this.args.aiIdentityModel.setProvisioningMode(
            aiIdentityAccountUuid,
            mode,
        );
        if (
            mode === AiIdentityCreationMode.AUTOMATIC &&
            settings.provisioner?.firstRunApprovedAt
        ) {
            await this.scheduleProvisioning(aiIdentityAccountUuid);
        }
        return this.getProvisioningSettings(account, aiIdentityAccountUuid);
    }

    async createProvisioner(
        account: Account,
        aiIdentityAccountUuid: string,
        names: CreateAiIdentityProvisioner,
    ): Promise<AiIdentityProvisioningSettings> {
        await this.checkAccount(account, aiIdentityAccountUuid);
        aiIdentitySnowflakeIdentifier(names.userName);
        aiIdentitySnowflakeIdentifier(names.roleName);
        await this.args.aiIdentityModel.createProvisioner(
            aiIdentityAccountUuid,
            names.userName,
            names.roleName,
            generateAiIdentityKeyPair(),
        );
        return this.getProvisioningSettings(account, aiIdentityAccountUuid);
    }

    async deleteProvisioner(
        account: Account,
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityProvisioningSettings> {
        await this.checkAccount(account, aiIdentityAccountUuid);
        await this.args.aiIdentityModel.deleteProvisioner(
            aiIdentityAccountUuid,
        );
        return this.getProvisioningSettings(account, aiIdentityAccountUuid);
    }

    async replaceAiRoles(
        account: Account,
        aiIdentityAccountUuid: string,
        roles: UpdateAiIdentityAiRoleDefinition[],
    ): Promise<AiIdentityProvisioningSettings> {
        const { organizationUuid, identityAccount } = await this.checkAccount(
            account,
            aiIdentityAccountUuid,
        );
        const { credentials } = await this.projectForAccount(
            organizationUuid,
            identityAccount.snowflakeAccount,
        );
        const normalized = roles.map((role) => ({
            roleName: aiIdentitySnowflakeIdentifier(
                role.roleName,
            ).toUpperCase(),
            warehouse: aiIdentitySnowflakeIdentifier(
                role.warehouse || credentials.warehouse,
            ),
            schemaRule: this.normalizeSchemaRule(role.schemaRule ?? null),
        }));
        if (
            new Set(normalized.map((role) => role.roleName.toUpperCase()))
                .size !== normalized.length
        )
            throw new ParameterError('Each AI role needs a distinct name.');
        const previousRoles = await this.args.aiIdentityModel.getAiRoles(
            aiIdentityAccountUuid,
        );
        const before = await this.provisionerRequirements(
            aiIdentityAccountUuid,
        );
        const requiresSetup =
            normalized.length !== previousRoles.length ||
            normalized.some(
                (role) =>
                    !previousRoles.some(
                        (previous) =>
                            previous.roleName.toUpperCase() === role.roleName &&
                            previous.warehouse.toUpperCase() ===
                                role.warehouse.toUpperCase() &&
                            previous.schemaRule.database.toUpperCase() ===
                                role.schemaRule.database,
                    ),
            );
        await this.args.aiIdentityModel.replaceAiRoles(
            aiIdentityAccountUuid,
            normalized,
            {
                organizationUuid,
                actorType:
                    account.isPatUser() || account.isServiceAccount()
                        ? 'api'
                        : 'user',
                actorUserUuid: account.user.id ?? null,
            },
        );
        await this.args.aiIdentityModel.setAutomaticSyncPending(
            aiIdentityAccountUuid,
            true,
        );
        await this.markProvisionerForSetupIfNeeded(
            aiIdentityAccountUuid,
            before,
        );
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            aiIdentityAccountUuid,
        );
        if (
            provisioner?.status === AiIdentityProvisionerStatus.READY &&
            !requiresSetup
        ) {
            try {
                await this.syncAutomaticRules(
                    aiIdentityAccountUuid,
                    await this.provisionerConnection(
                        aiIdentityAccountUuid,
                        false,
                        previousRoles.map((role) => role.roleName),
                    ),
                    previousRoles,
                );
            } catch {
                await this.args.aiIdentityModel.updateProvisioner(
                    aiIdentityAccountUuid,
                    {
                        status: AiIdentityProvisionerStatus.WAITING_FOR_SETUP,
                        statusMessage:
                            'Run the updated setup script and check the provisioner again.',
                    },
                );
            }
        }
        return this.getProvisioningSettings(account, aiIdentityAccountUuid);
    }

    private normalizeSchemaRule(
        rule: AiIdentitySchemaRule | null,
    ): AiIdentitySchemaRule {
        if (!rule)
            throw new ParameterError(
                'Set a database and the schemas to exclude.',
            );
        if (!rule.database) throw new ParameterError('Select a database.');
        return {
            database: aiIdentitySnowflakeIdentifier(
                rule.database,
            ).toUpperCase(),
            excludePatterns: [
                ...new Set(
                    rule.excludePatterns.map((pattern) => {
                        if (!isValidSchemaPattern(pattern))
                            throw new ParameterError('Invalid schema pattern.');
                        return pattern.trim().toUpperCase();
                    }),
                ),
            ].sort(),
        };
    }

    private async provisionerRequirements(
        aiIdentityAccountUuid: string,
    ): Promise<{ roles: Set<string>; definitions: Set<string> }> {
        const [mappings, aiRoles] = await Promise.all([
            this.args.aiIdentityModel.getRoleMappings(aiIdentityAccountUuid),
            this.args.aiIdentityModel.getAiRoles(aiIdentityAccountUuid),
        ]);
        return {
            roles: new Set(
                [
                    ...mappings.map((mapping) => mapping.aiRole),
                    ...aiRoles.map((role) => role.roleName),
                ].map((role) => role.toUpperCase()),
            ),
            definitions: new Set(
                aiRoles.map((role) =>
                    JSON.stringify([
                        role.roleName.toUpperCase(),
                        role.warehouse.toUpperCase(),
                        role.schemaRule.database.toUpperCase(),
                    ]),
                ),
            ),
        };
    }

    private async markProvisionerForSetupIfNeeded(
        aiIdentityAccountUuid: string,
        before: { roles: Set<string>; definitions: Set<string> },
    ): Promise<void> {
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            aiIdentityAccountUuid,
        );
        if (!provisioner) return;
        const after = await this.provisionerRequirements(aiIdentityAccountUuid);
        const needsSetup =
            [...after.roles].some((role) => !before.roles.has(role)) ||
            [...before.roles].some((role) => !after.roles.has(role)) ||
            [...after.definitions].some(
                (definition) => !before.definitions.has(definition),
            ) ||
            [...before.definitions].some(
                (definition) => !after.definitions.has(definition),
            );
        if (!needsSetup) return;
        await this.args.aiIdentityModel.updateProvisioner(
            aiIdentityAccountUuid,
            {
                status: AiIdentityProvisionerStatus.WAITING_FOR_SETUP,
                statusMessage:
                    'Run the updated setup script and check the provisioner again.',
                setupCheck: {
                    waitingSince: null,
                    nextCheckAt: null,
                    signedInAt: provisioner.setupCheck?.signedInAt ?? null,
                    checkedByName: null,
                    automatic: true,
                    checks: [],
                },
            },
        );
    }

    private async provisionerConnection(
        aiIdentityAccountUuid: string,
        probe = false,
        previousRoles: string[] = [],
    ): Promise<ProvisionerConnection> {
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            aiIdentityAccountUuid,
        );
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            aiIdentityAccountUuid,
        );
        if (!identityAccount || !provisioner)
            throw new NotFoundError('AI identity provisioner not found');
        const { credentials } = await this.projectForAccount(
            identityAccount.organizationUuid,
            identityAccount.snowflakeAccount,
        );
        const mappings = probe
            ? []
            : await this.args.aiIdentityModel.getRoleMappings(
                  aiIdentityAccountUuid,
              );
        const aiRoles = probe
            ? []
            : await this.args.aiIdentityModel.getAiRoles(aiIdentityAccountUuid);
        const identities = probe
            ? []
            : await this.args.aiIdentityModel.getProvisioningIdentities(
                  aiIdentityAccountUuid,
              );
        const drops = probe
            ? []
            : await this.args.aiIdentityModel.listProvisioningDrops(
                  aiIdentityAccountUuid,
              );
        return new ProvisionerConnection(
            credentials,
            provisioner.userName,
            probe ? null : provisioner.roleName,
            provisioner.privateKey,
            {
                mappedRoles: new Set([
                    ...mappings.map((mapping) => mapping.aiRole),
                    ...aiRoles.map((role) => role.roleName),
                    ...previousRoles,
                ]),
                lightdashCreatedUsers: new Set([
                    ...identities
                        .filter((identity) => identity.createdByProvisioner)
                        .map((identity) => identity.provisionedUserName)
                        .filter((name): name is string => name !== null),
                    ...drops.map((drop) => drop.userName),
                ]),
            },
        );
    }

    private async checkUngrantedSchemas(
        aiIdentityAccountUuid: string,
        aiRoles: AiIdentityAiRoleDefinition[],
        previous: AiIdentityUngrantedSchemas[],
    ): Promise<{
        results: AiIdentityUngrantedSchemas[];
        checkedRoles: number;
        error: string | null;
    }> {
        const patternRoles = aiRoles.filter(
            (role) => role.schemaRule.database !== '',
        );
        if (patternRoles.length === 0)
            return { results: [], checkedRoles: 0, error: null };
        const account = await this.args.aiIdentityModel.getAccount(
            aiIdentityAccountUuid,
        );
        if (!account) throw new NotFoundError('AI identity account not found');
        const { projectUuid, credentials } = await this.projectForAccount(
            account.organizationUuid,
            account.snowflakeAccount,
        );
        const catalog =
            await this.args.aiIdentityModel.getCachedCatalogSchemas(
                projectUuid,
            );
        const identities =
            await this.args.aiIdentityModel.getProvisioningIdentities(
                aiIdentityAccountUuid,
            );
        const mappings = await this.args.aiIdentityModel.getRoleMappings(
            aiIdentityAccountUuid,
        );
        let checkedRoles = 0;
        const results: AiIdentityUngrantedSchemas[] = [];
        let error: string | null = null;
        const previousFor = (role: AiIdentityAiRoleDefinition) => {
            const prior = previous.find(
                (item) =>
                    item.roleName.toUpperCase() === role.roleName.toUpperCase(),
            );
            if (!prior) return null;
            const schemas = prior.schemas.filter((schema) => {
                const [database, name] = schema.split('.');
                return (
                    database?.toUpperCase() ===
                        role.schemaRule.database.toUpperCase() &&
                    !matchesSchemaPattern(name, role.schemaRule.excludePatterns)
                );
            });
            return schemas.length > 0 ? { ...prior, schemas } : null;
        };
        await forEachSequential(patternRoles, async (role) => {
            if (!catalog.loaded) {
                const prior = previousFor(role);
                if (prior) results.push(prior);
                return;
            }
            const expansion = expandAiIdentitySchemaRule(
                role.schemaRule,
                catalog.schemas,
            );
            const ready = identities.filter(
                (identity) =>
                    identity.state === AiIdentityState.READY &&
                    identity.twinName !== null,
            );
            const matches = (name: string | null): boolean =>
                name?.toUpperCase() === role.roleName.toUpperCase();
            const selected =
                ready.find((identity) => matches(identity.provisionedRole)) ??
                ready.find((identity) => {
                    if (identity.provisionedRole !== null) return false;
                    const templateRole =
                        account.roleTemplate !== null &&
                        (!account.roleTemplate.includes(
                            SNOWFLAKE_LOGIN_PLACEHOLDER,
                        ) ||
                            identity.snowflakeLogin !== null) &&
                        (!account.roleTemplate.includes(
                            AI_IDENTITY_NAME_PLACEHOLDER,
                        ) ||
                            identity.twinName !== null)
                            ? resolveAiIdentityRole(
                                  account.roleTemplate,
                                  identity.snowflakeLogin,
                                  identity.twinName,
                              )
                            : null;
                    const mapping = mappings
                        .filter((item) =>
                            identity.groupUuids.includes(item.groupUuid),
                        )
                        .sort(
                            (a, b) =>
                                a.priority - b.priority ||
                                a.groupUuid.localeCompare(b.groupUuid),
                        )[0];
                    return (
                        matches(templateRole) ||
                        matches(mapping?.aiRole ?? null)
                    );
                });
            if (!selected) {
                const prior = previousFor(role);
                if (prior) results.push(prior);
                return;
            }
            try {
                const privateIdentity =
                    await this.args.aiIdentityModel.findByUuidWithPrivateKey(
                        selected.aiIdentityUuid,
                    );
                if (!privateIdentity?.privateKey || !privateIdentity.twinName)
                    throw new Error(
                        'The ready AI identity has no private key or user name',
                    );
                const databases = [role.schemaRule.database];
                const visible = await listAiTwinSchemas(
                    buildAiTwinCredentials({
                        projectCredentials: credentials,
                        twinName: privateIdentity.twinName,
                        privateKey: privateIdentity.privateKey,
                    }),
                    databases,
                );
                checkedRoles += 1;
                if (
                    expansion.excluded.some((schema) =>
                        visible.some(
                            (name) =>
                                name.toUpperCase() === schema.toUpperCase(),
                        ),
                    )
                )
                    error = `The AI role ${role.roleName} can read an excluded schema.`;
                const schemas = missingSchemas(expansion.allowed, visible);
                if (schemas.length > 0)
                    results.push({
                        roleName: role.roleName,
                        schemas,
                    });
            } catch {
                const prior = previousFor(role);
                if (prior) results.push(prior);
                error = `The schema check for ${role.roleName} failed.`;
            }
        });
        return { results, checkedRoles, error };
    }

    async startWaitingForSetup(
        account: Account,
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityProvisioningSettings> {
        const { organizationUuid } = await this.checkAccount(
            account,
            aiIdentityAccountUuid,
        );
        await this.args.aiIdentityModel.withProvisioningLock(
            aiIdentityAccountUuid,
            async () => {
                const provisioner =
                    await this.args.aiIdentityModel.getProvisioner(
                        aiIdentityAccountUuid,
                    );
                if (!provisioner)
                    throw new NotFoundError(
                        'AI identity provisioner not found',
                    );
                if (
                    !provisioner.setupCheck?.waitingSince &&
                    provisioner.status ===
                        AiIdentityProvisionerStatus.WAITING_FOR_SETUP
                ) {
                    const now = new Date().toISOString();
                    await this.args.aiIdentityModel.saveProvisionerSetupCheck(
                        aiIdentityAccountUuid,
                        {
                            setupCheck: {
                                waitingSince: now,
                                nextCheckAt: new Date(
                                    Date.now() + 10_000,
                                ).toISOString(),
                                signedInAt:
                                    provisioner.setupCheck?.signedInAt ?? null,
                                checkedByName: null,
                                automatic: true,
                                checks: [],
                            },
                        },
                        {
                            organizationUuid,
                            aiIdentityAccountUuid,
                            aiIdentityUuid: null,
                            actorType: 'user',
                            actorUserUuid: account.user.id,
                            action: 'setup_waiting',
                            targetCount: 1,
                            status: 'success',
                            detail: 'Waiting for setup.',
                        },
                    );
                }
            },
        );
        await this.scheduleSetupCheck(aiIdentityAccountUuid);
        return this.getProvisioningSettings(account, aiIdentityAccountUuid);
    }

    private async scheduleSetupCheck(
        aiIdentityAccountUuid: string,
    ): Promise<void> {
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            aiIdentityAccountUuid,
        );
        const next = provisioner?.setupCheck?.nextCheckAt;
        if (next)
            await this.args.schedulerClient.scheduleAiIdentitySetupCheck(
                aiIdentityAccountUuid,
                new Date(next),
            );
    }

    async pollSetupCheck(
        account: Account,
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityProvisioningSettings> {
        await this.checkAccount(account, aiIdentityAccountUuid);
        await this.runSetupCheck(aiIdentityAccountUuid);
        return this.getProvisioningSettings(account, aiIdentityAccountUuid);
    }

    async runSetupCheck(aiIdentityAccountUuid: string): Promise<void> {
        await this.args.aiIdentityModel.withProvisioningLock(
            aiIdentityAccountUuid,
            async () => {
                const provisioner =
                    await this.args.aiIdentityModel.getProvisioner(
                        aiIdentityAccountUuid,
                    );
                const state = provisioner?.setupCheck;
                if (!state?.nextCheckAt) return;
                const interval = getAiIdentitySetupCheckInterval(
                    state.waitingSince,
                );
                if (interval === false) {
                    const identityAccount =
                        await this.args.aiIdentityModel.getAccount(
                            aiIdentityAccountUuid,
                        );
                    if (identityAccount)
                        await this.args.aiIdentityModel.saveProvisionerSetupCheck(
                            aiIdentityAccountUuid,
                            { setupCheck: { ...state, nextCheckAt: null } },
                            {
                                organizationUuid:
                                    identityAccount.organizationUuid,
                                aiIdentityAccountUuid,
                                aiIdentityUuid: null,
                                actorType: 'scheduler',
                                actorUserUuid: null,
                                action: 'setup_check_result',
                                targetCount: 1,
                                status: 'success',
                                detail: 'The setup check stopped after two hours.',
                            },
                        );
                    return;
                }
                if (new Date(state.nextCheckAt).getTime() > Date.now()) return;
                await this.checkProvisionerSetup(aiIdentityAccountUuid, null);
            },
        );
        await this.scheduleSetupCheck(aiIdentityAccountUuid);
    }

    async verifyProvisioner(
        account: Account,
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityProvisioningSettings> {
        await this.checkAccount(account, aiIdentityAccountUuid);
        await this.args.aiIdentityModel.withProvisioningLock(
            aiIdentityAccountUuid,
            () => this.checkProvisionerSetup(aiIdentityAccountUuid, account),
        );
        return this.getProvisioningSettings(account, aiIdentityAccountUuid);
    }

    private async checkProvisionerSetup(
        aiIdentityAccountUuid: string,
        actor: Account | null,
    ): Promise<void> {
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            aiIdentityAccountUuid,
        );
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            aiIdentityAccountUuid,
        );
        if (!provisioner || !identityAccount)
            throw new NotFoundError('AI identity provisioner not found');
        if (actor !== null) assertRegisteredAccount(actor);
        const previous = provisioner.setupCheck;
        const sync = await this.args.aiIdentityModel.getAutomaticSync(
            aiIdentityAccountUuid,
        );
        const aiRoles = await this.args.aiIdentityModel.getAiRoles(
            aiIdentityAccountUuid,
        );
        const state: AiIdentitySetupCheck = {
            waitingSince: previous?.waitingSince ?? null,
            nextCheckAt: null,
            signedInAt: previous?.signedInAt ?? null,
            checkedByName: actor
                ? `${actor.user.firstName} ${actor.user.lastName}`.trim()
                : null,
            automatic: actor === null,
            checks: [
                {
                    key: 'sign_in',
                    label: 'The setup user signs in with its key',
                    status: 'pending',
                    detail: null,
                },
                {
                    key: 'create_identities',
                    label: 'The setup role can create AI identities',
                    status: 'pending',
                    detail: null,
                },
                {
                    key: 'sync_installed',
                    label: 'The grant sync is installed and scheduled',
                    status: 'pending',
                    detail: null,
                },
                {
                    key: 'exclusions',
                    label: 'The exclusions are applied',
                    status: 'pending',
                    detail: null,
                },
                {
                    key: 'first_sync',
                    label: 'The first grant sync is complete',
                    status: 'pending',
                    detail: null,
                },
            ],
        };
        const [
            signInCheck,
            createCheck,
            installedCheck,
            exclusionsCheck,
            firstSyncCheck,
        ] = state.checks;
        let active: AiIdentitySetupCheckItem = signInCheck;
        let { findings, ungrantedSchemas } = provisioner;
        let credentialsWarehouse: string | null = null;
        try {
            credentialsWarehouse =
                (
                    await this.projectForAccount(
                        identityAccount.organizationUuid,
                        identityAccount.snowflakeAccount,
                    )
                ).credentials.warehouse || null;
            const probe = await this.provisionerConnection(
                aiIdentityAccountUuid,
                true,
            );
            const current = await probe.currentIdentity();
            state.signedInAt = state.signedInAt ?? new Date().toISOString();
            if (
                current.user.toUpperCase() !==
                provisioner.userName.toUpperCase()
            )
                throw new Error('The key signs in as a different setup user.');
            active.status = 'passed';
            active = createCheck;
            const connection = await this.provisionerConnection(
                aiIdentityAccountUuid,
            );
            const setupIdentity = await connection.currentIdentity();
            if (
                setupIdentity.role.toUpperCase() !==
                provisioner.roleName.toUpperCase()
            )
                throw new Error('The setup user cannot use the setup role.');
            const mappings = await this.args.aiIdentityModel.getRoleMappings(
                aiIdentityAccountUuid,
            );
            const missing = missingProvisionerGrants(
                await connection.grantsToRole(provisioner.roleName),
                new Set([
                    ...mappings.map((mapping) => mapping.aiRole),
                    ...aiRoles.map((role) => role.roleName),
                ]),
            );
            active.status = missing.length === 0 ? 'passed' : 'failed';
            active.detail =
                missing.length === 0
                    ? null
                    : `The setup role needs ${missing.join(', ')}.`;
            const identities =
                await this.args.aiIdentityModel.getProvisioningIdentities(
                    aiIdentityAccountUuid,
                );
            const drops = await this.args.aiIdentityModel.listProvisioningDrops(
                aiIdentityAccountUuid,
            );
            const created = new Set([
                ...identities
                    .filter((identity) => identity.createdByProvisioner)
                    .map((identity) => identity.provisionedUserName)
                    .filter((name): name is string => name !== null),
                ...drops.map((drop) => drop.userName),
            ]);
            findings = classifyProvisionerUsers(
                await connection.users(),
                provisioner.roleName,
                created,
            );
            installedCheck.status =
                sync.lastRunAt !== null ? 'passed' : 'pending';
            active = exclusionsCheck;
            const patterns = [
                ...new Set(
                    aiRoles.flatMap((role) => role.schemaRule.excludePatterns),
                ),
            ];
            active.label = `The exclusions are applied: ${patterns.length > 0 ? patterns.join(', ') : 'none'}`;
            const schemaCheck = await this.checkUngrantedSchemas(
                aiIdentityAccountUuid,
                aiRoles,
                provisioner.ungrantedSchemas ?? [],
            );
            ungrantedSchemas = schemaCheck.results;
            if (schemaCheck.error !== null) {
                active.status = 'failed';
                active.detail =
                    schemaCheck.error ??
                    'The AI role cannot read an allowed schema.';
            } else if (schemaCheck.results.length > 0) {
                active.detail = `${schemaCheck.results.reduce((count, item) => count + item.schemas.length, 0)} schemas wait for the next grant sync.`;
            } else if (
                aiRoles.some((role) => role.schemaRule.database !== '') &&
                schemaCheck.checkedRoles ===
                    aiRoles.filter((role) => role.schemaRule.database !== '')
                        .length
            ) {
                active.status = 'passed';
            } else {
                active.detail =
                    'The schema check waits for an AI role with a database and a ready AI identity.';
            }
            const catalog =
                await this.args.aiIdentityModel.getCachedCatalogSchemas(
                    (
                        await this.projectForAccount(
                            identityAccount.organizationUuid,
                            identityAccount.snowflakeAccount,
                        )
                    ).projectUuid,
                );
            const total = aiRoles.reduce(
                (count, role) =>
                    count +
                    expandAiIdentitySchemaRule(role.schemaRule, catalog.schemas)
                        .allowed.length,
                0,
            );
            const roleNames = aiRoles.map((role) => role.roleName).join(', ');
            firstSyncCheck.label = `The first grant sync is complete: ${roleNames || 'the AI role'} can read ${total} ${total === 1 ? 'schema' : 'schemas'}`;
            if (
                sync.status === AiIdentitySyncStatus.OK &&
                sync.lastRunAt !== null
            ) {
                firstSyncCheck.status = 'passed';
            } else if (sync.status === AiIdentitySyncStatus.RUNNING) {
                firstSyncCheck.detail = `${Math.min(sync.progress, total)} of ${total} schemas`;
            } else if (sync.status === AiIdentitySyncStatus.UNSAFE) {
                firstSyncCheck.status = 'failed';
                firstSyncCheck.detail = 'Check the latest grant sync run.';
            }
        } catch (cause) {
            if (
                state.signedInAt === null &&
                provisioner.status !== AiIdentityProvisionerStatus.READY
            ) {
                const interval = getAiIdentitySetupCheckInterval(
                    state.waitingSince,
                );
                if (interval === false && previous?.nextCheckAt) {
                    await this.args.aiIdentityModel.saveProvisionerSetupCheck(
                        aiIdentityAccountUuid,
                        { setupCheck: state },
                        {
                            organizationUuid: identityAccount.organizationUuid,
                            aiIdentityAccountUuid,
                            aiIdentityUuid: null,
                            actorType: 'scheduler',
                            actorUserUuid: null,
                            action: 'setup_check_result',
                            targetCount: 1,
                            status: 'success',
                            detail: 'The setup check stopped after two hours.',
                        },
                    );
                    return;
                }
                await this.args.aiIdentityModel.updateProvisioner(
                    aiIdentityAccountUuid,
                    {
                        setupCheck: {
                            ...state,
                            nextCheckAt:
                                interval === false
                                    ? null
                                    : new Date(
                                          Math.min(
                                              Date.now() + interval,
                                              new Date(
                                                  state.waitingSince!,
                                              ).getTime() +
                                                  2 * 60 * 60 * 1000,
                                          ),
                                      ).toISOString(),
                        },
                    },
                );
                return;
            }
            active.status = 'failed';
            active.detail = setupCheckFailureDetail(
                active.key,
                cause,
                credentialsWarehouse,
            );
        }
        const failed = state.checks.filter((item) => item.status === 'failed');
        await this.args.aiIdentityModel.saveProvisionerSetupCheck(
            aiIdentityAccountUuid,
            {
                setupCheck: state,
                status:
                    failed.length === 0
                        ? AiIdentityProvisionerStatus.READY
                        : AiIdentityProvisionerStatus.FAILING,
                statusMessage:
                    failed.map((item) => item.detail).join(' ') || null,
                findings,
                ungrantedSchemas,
            },
            {
                organizationUuid: identityAccount.organizationUuid,
                aiIdentityAccountUuid,
                aiIdentityUuid: null,
                actorType: actor === null ? 'scheduler' : 'user',
                actorUserUuid: actor?.user.id ?? null,
                action:
                    actor === null
                        ? 'setup_check_result'
                        : 'provisioner_verify',
                targetCount: 1,
                status: failed.length === 0 ? 'success' : 'error',
                detail: failed.map((item) => item.detail).join(' ') || null,
            },
        );
    }

    async replaceProvisioningMappings(
        account: Account,
        aiIdentityAccountUuid: string,
        mappings: UpdateAiIdentityRoleMapping[],
    ): Promise<AiIdentityProvisioningSettings> {
        const { organizationUuid } = await this.checkAccount(
            account,
            aiIdentityAccountUuid,
        );
        const groups =
            await this.args.aiIdentityModel.getOrganizationGroupUuids(
                organizationUuid,
            );
        if (mappings.some((mapping) => !groups.has(mapping.groupUuid)))
            throw new ParameterError(
                'A group does not belong to this organization.',
            );
        if (
            new Set(mappings.map((mapping) => mapping.groupUuid)).size !==
            mappings.length
        )
            throw new ParameterError(
                'A group can have only one AI role mapping.',
            );
        if (mappings.some((mapping) => !Number.isInteger(mapping.priority)))
            throw new ParameterError(
                'AI role mapping priority must be an integer.',
            );
        buildAiIdentityProvisionerSetupSql({
            userName: DEFAULT_AI_IDENTITY_PROVISIONER_USER,
            roleName: DEFAULT_AI_IDENTITY_PROVISIONER_ROLE,
            publicKey: 'YWJj',
            aiRoles: [],
            existingAiRoles: mappings.map((mapping) => mapping.aiRole),
            catalogLoaded: true,
        });
        const before = await this.provisionerRequirements(
            aiIdentityAccountUuid,
        );
        await this.args.aiIdentityModel.replaceRoleMappings(
            aiIdentityAccountUuid,
            mappings,
        );
        await this.markProvisionerForSetupIfNeeded(
            aiIdentityAccountUuid,
            before,
        );
        const settings = await this.getProvisioningSettings(
            account,
            aiIdentityAccountUuid,
        );
        if (settings.effectiveMode === AiIdentityCreationMode.AUTOMATIC)
            await this.scheduleProvisioning(aiIdentityAccountUuid);
        return settings;
    }

    private async scopedProvisioningUsers(
        aiIdentityAccountUuid: string,
    ): Promise<Set<string>> {
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            aiIdentityAccountUuid,
        );
        if (!identityAccount)
            throw new NotFoundError('AI identity account not found');
        const projects = await this.args.projectModel.getAllByOrganizationUuid(
            identityAccount.organizationUuid,
        );
        const users = new Set<string>();
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
                    organizationUuid: identityAccount.organizationUuid,
                },
            );
            members.forEach((member) => users.add(member));
        });
        return users;
    }

    private async buildProvisioningPlan(
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityProvisioningPlan> {
        const [identities, scopedUserUuids, mappings, pendingDrops] =
            await Promise.all([
                this.args.aiIdentityModel.getProvisioningIdentities(
                    aiIdentityAccountUuid,
                ),
                this.scopedProvisioningUsers(aiIdentityAccountUuid),
                this.args.aiIdentityModel.getRoleMappings(
                    aiIdentityAccountUuid,
                ),
                this.args.aiIdentityModel.listProvisioningDrops(
                    aiIdentityAccountUuid,
                ),
            ]);
        return buildProvisioningPlan({
            identities,
            scopedUserUuids,
            mappings,
            pendingDrops,
        });
    }

    async getProvisioningPlan(
        account: Account,
        aiIdentityAccountUuid: string,
    ): Promise<AiIdentityProvisioningPlan> {
        await this.checkAccount(account, aiIdentityAccountUuid);
        return this.buildProvisioningPlan(aiIdentityAccountUuid);
    }

    async runProvisioning(
        account: Account,
        aiIdentityAccountUuid: string,
        approveStatements: boolean,
    ): Promise<AiIdentityJob> {
        await this.checkAccount(account, aiIdentityAccountUuid);
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            aiIdentityAccountUuid,
        );
        if (provisioner?.status !== AiIdentityProvisionerStatus.READY)
            throw new ParameterError(
                'Verify the Snowflake provisioner before running automatic AI identities.',
            );
        if (provisioner.firstRunApprovedAt === null) {
            if (approveStatements !== true)
                throw new ParameterError(
                    'Approve the provisioning statements before the first run.',
                );
            await this.args.aiIdentityModel.updateProvisioner(
                aiIdentityAccountUuid,
                { approvedBy: account.user.id },
            );
        }
        return this.queueJob(
            account,
            AiIdentityJobKind.PROVISION,
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
            'provision',
        );
    }

    private async scheduleProvisioning(
        aiIdentityAccountUuid: string,
    ): Promise<void> {
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            aiIdentityAccountUuid,
        );
        if (!identityAccount)
            throw new NotFoundError('AI identity account not found');
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            aiIdentityAccountUuid,
        );
        if (
            provisioner?.status !== AiIdentityProvisionerStatus.READY ||
            provisioner.firstRunApprovedAt === null
        )
            return;
        const job = await this.args.aiIdentityModel.createJob({
            organizationUuid: identityAccount.organizationUuid,
            aiIdentityAccountUuid,
            kind: AiIdentityJobKind.PROVISION,
            filter: {
                aiIdentityAccountUuid,
                states: [],
                reasons: [],
                projectUuid: null,
                search: null,
                staleOnly: false,
            },
            format: null,
            roleForTwin: null,
            createdByUserUuid: null,
        });
        await this.args.schedulerClient.scheduleTask(
            SCHEDULER_TASKS.AI_IDENTITY_JOB,
            { jobUuid: job.jobUuid },
        );
    }

    private async runProvisioningJob(
        job: AiIdentityJob & {
            organizationUuid: string;
            aiIdentityAccountUuid: string;
            createdByUserUuid: string | null;
        },
    ): Promise<number> {
        return this.args.aiIdentityModel.withProvisioningLock(
            job.aiIdentityAccountUuid,
            () => this.runProvisioningJobUnlocked(job),
        );
    }

    private async runProvisioningJobUnlocked(
        job: AiIdentityJob & {
            organizationUuid: string;
            aiIdentityAccountUuid: string;
            createdByUserUuid: string | null;
        },
    ): Promise<number> {
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            job.aiIdentityAccountUuid,
        );
        const mode = await this.args.aiIdentityModel.getProvisioningMode(
            job.aiIdentityAccountUuid,
        );
        if (
            !provisioner ||
            provisioner.status !== AiIdentityProvisionerStatus.READY ||
            provisioner.firstRunApprovedAt === null
        )
            throw new Error(
                'The provisioner is not ready or the first run has not been approved.',
            );
        if (
            mode !== AiIdentityCreationMode.AUTOMATIC &&
            job.createdByUserUuid === null
        )
            return 0;
        const connection = await this.provisionerConnection(
            job.aiIdentityAccountUuid,
        );
        try {
            const current = await connection.currentIdentity();
            if (
                current.user.toUpperCase() !==
                    provisioner.userName.toUpperCase() ||
                current.role.toUpperCase() !==
                    provisioner.roleName.toUpperCase()
            ) {
                throw new Error(
                    `Snowflake signed in as ${current.user} with role ${current.role}, rather than the provisioner.`,
                );
            }
            const mappings = await this.args.aiIdentityModel.getRoleMappings(
                job.aiIdentityAccountUuid,
            );
            const missing = missingProvisionerGrants(
                await connection.grantsToRole(provisioner.roleName),
                new Set(mappings.map((mapping) => mapping.aiRole)),
            );
            if (missing.length > 0)
                throw new Error(
                    `The provisioner is missing ${missing.join(', ')}.`,
                );
            const identities =
                await this.args.aiIdentityModel.getProvisioningIdentities(
                    job.aiIdentityAccountUuid,
                );
            const drops = await this.args.aiIdentityModel.listProvisioningDrops(
                job.aiIdentityAccountUuid,
            );
            const created = new Set([
                ...identities
                    .filter((identity) => identity.createdByProvisioner)
                    .map((identity) => identity.provisionedUserName)
                    .filter((name): name is string => name !== null),
                ...drops.map((drop) => drop.userName),
            ]);
            const findings = classifyProvisionerUsers(
                await connection.users(),
                provisioner.roleName,
                created,
            );
            await this.args.aiIdentityModel.updateProvisioner(
                job.aiIdentityAccountUuid,
                { findings },
            );
            const changedTypes = findings.filter(
                (finding) =>
                    finding.reason ===
                        AiIdentityProvisionerFindingReason.NOT_SERVICE_AGENT &&
                    [...created].some(
                        (name) =>
                            name.toUpperCase() ===
                            finding.userName.toUpperCase(),
                    ),
            );
            if (changedTypes.length > 0)
                throw new Error(
                    'A Lightdash-created AI user is no longer a SERVICE_AGENT. Review the provisioner findings before running again.',
                );
            const plan = await this.buildProvisioningPlan(
                job.aiIdentityAccountUuid,
            );
            await this.args.aiIdentityModel.updateJob(job.jobUuid, {
                total: plan.items.length,
                skipped: plan.skipped,
            });
            let done = 0;
            const toTest = new Set<string>();
            await forEachSequential(plan.items, async (item) => {
                try {
                    await connection.execute(item.operation);
                    await this.args.aiIdentityModel.addEvent({
                        organizationUuid: job.organizationUuid,
                        aiIdentityAccountUuid: job.aiIdentityAccountUuid,
                        aiIdentityUuid: item.aiIdentityUuid,
                        aiIdentityJobUuid: job.jobUuid,
                        actorType:
                            job.createdByUserUuid === null
                                ? 'scheduler'
                                : 'user',
                        actorUserUuid: job.createdByUserUuid,
                        action: 'provision_statement',
                        targetCount: 1,
                        status: 'success',
                        detail: item.sql,
                    });
                    if (
                        item.operation.kind === 'create_user' &&
                        item.aiIdentityUuid !== null
                    ) {
                        const identity = identities.find(
                            (entry) =>
                                entry.aiIdentityUuid === item.aiIdentityUuid,
                        );
                        await this.args.aiIdentityModel.markProvisioned(
                            item.aiIdentityUuid,
                            null,
                            item.operation.userName,
                            identity?.publicKeyFingerprint ?? null,
                        );
                    }
                    if (
                        item.operation.kind === 'grant_role' &&
                        item.aiIdentityUuid !== null
                    ) {
                        const identity = identities.find(
                            (entry) =>
                                entry.aiIdentityUuid === item.aiIdentityUuid,
                        );
                        if (
                            identity?.provisionedRole === null ||
                            !identity?.createdByProvisioner
                        ) {
                            await this.args.aiIdentityModel.markProvisioned(
                                item.aiIdentityUuid,
                                item.operation.role,
                                item.operation.userName,
                                identity?.publicKeyFingerprint ?? null,
                            );
                        }
                    }
                    if (
                        item.operation.kind === 'set_default_role' &&
                        item.aiIdentityUuid !== null
                    ) {
                        const identity = identities.find(
                            (entry) =>
                                entry.aiIdentityUuid === item.aiIdentityUuid,
                        );
                        await this.args.aiIdentityModel.markProvisioned(
                            item.aiIdentityUuid,
                            item.operation.role,
                            item.operation.userName,
                            identity?.publicKeyFingerprint ?? null,
                        );
                    }
                    if (
                        item.operation.kind === 'set_public_key' &&
                        item.aiIdentityUuid !== null
                    ) {
                        const identity = identities.find(
                            (entry) =>
                                entry.aiIdentityUuid === item.aiIdentityUuid,
                        );
                        if (identity)
                            await this.args.aiIdentityModel.markProvisionedKey(
                                item.aiIdentityUuid,
                                identity.publicKeyFingerprint,
                            );
                    }
                    if (item.operation.kind === 'drop_user') {
                        if (item.aiIdentityUuid !== null)
                            await this.args.aiIdentityModel.clearProvisioned(
                                item.aiIdentityUuid,
                            );
                        const drop = drops.find(
                            (entry) =>
                                entry.userName === item.operation.userName,
                        );
                        if (drop)
                            await this.args.aiIdentityModel.removeProvisioningDrop(
                                drop.uuid,
                            );
                    }
                    if (
                        item.operation.kind !== 'drop_user' &&
                        item.aiIdentityUuid !== null
                    )
                        toTest.add(item.aiIdentityUuid);
                } catch (error) {
                    await this.args.aiIdentityModel.addEvent({
                        organizationUuid: job.organizationUuid,
                        aiIdentityAccountUuid: job.aiIdentityAccountUuid,
                        aiIdentityUuid: item.aiIdentityUuid,
                        aiIdentityJobUuid: job.jobUuid,
                        actorType:
                            job.createdByUserUuid === null
                                ? 'scheduler'
                                : 'user',
                        actorUserUuid: job.createdByUserUuid,
                        action: 'provision_statement',
                        targetCount: 1,
                        status: 'error',
                        detail: item.sql,
                    });
                    throw error;
                }
                done += 1;
                await this.args.aiIdentityModel.updateJob(job.jobUuid, {
                    done,
                });
            });
            await forEachSequential([...toTest], async (aiIdentityUuid) => {
                await this.testIdentityByUuid(aiIdentityUuid);
            });
            return new Set(
                plan.items.map((item) => item.operation.userName.toUpperCase()),
            ).size;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            await this.args.aiIdentityModel.updateProvisioner(
                job.aiIdentityAccountUuid,
                {
                    status: /JWT token is invalid|user.*(does not exist|not found)/i.test(
                        message,
                    )
                        ? AiIdentityProvisionerStatus.REVOKED
                        : AiIdentityProvisionerStatus.FAILING,
                    statusMessage: message,
                },
            );
            throw error;
        }
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
        aiIdentityJobUuid: string | null = null,
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
            aiIdentityJobUuid,
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
        roleTemplate: string | null = null,
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
        if (roleTemplate !== null) validateAiIdentityRoleTemplate(roleTemplate);
        const result = await this.args.aiIdentityModel.updateAccountTemplate(
            aiIdentityAccountUuid,
            twinNameTemplate,
            roleTemplate,
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
        includeReads = false,
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
                includeReads,
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
        const warehouse =
            identity.failureReason === AiIdentityFailureReason.WAREHOUSE_ACCESS
                ? (
                      await this.projectForAccount(
                          organizationUuid,
                          identity.snowflakeAccount,
                      )
                  ).credentials.warehouse
                : null;
        const identityAccount = await this.args.aiIdentityModel.getAccount(
            identity.aiIdentityAccountUuid,
        );
        const roleTemplate = identityAccount?.roleTemplate ?? null;
        const roleForTwin =
            roleTemplate !== null &&
            (!roleTemplate.includes(SNOWFLAKE_LOGIN_PLACEHOLDER) ||
                identity.snowflakeLogin !== null) &&
            (!roleTemplate.includes(AI_IDENTITY_NAME_PLACEHOLDER) ||
                identity.twinName !== null)
                ? resolveAiIdentityRole(
                      roleTemplate,
                      identity.snowflakeLogin,
                      identity.twinName,
                  )
                : null;
        return {
            identity,
            fixSql:
                identity.failureReason === null
                    ? null
                    : buildAiIdentityFixSql({
                          reason: identity.failureReason,
                          twinName: identity.twinName,
                          publicKey: identity.publicKey,
                          roleForTwin,
                          warehouse,
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
                aiIdentityJobUuid: job.jobUuid,
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
            0,
            job.jobUuid,
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
        const roleForTwin =
            request.roleForTwin === undefined
                ? (
                      await this.checkAccount(
                          account,
                          request.filter.aiIdentityAccountUuid,
                      )
                  ).identityAccount.roleTemplate
                : request.roleForTwin;
        if (roleForTwin !== null) validateAiIdentityRoleTemplate(roleForTwin);
        return this.queueJob(
            account,
            AiIdentityJobKind.EXPORT,
            request.filter,
            request.format,
            roleForTwin,
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
    async getPreview(account: Account, aiIdentityAccountUuid: string) {
        await this.checkAccount(account, aiIdentityAccountUuid);
        return this.args.aiIdentityModel.preview(aiIdentityAccountUuid);
    }

    async getRequestLog(
        account: Account,
        page: number,
        pageSize: number,
        includeReads = false,
        exclusionAccountUuid: string | null = null,
    ) {
        const organizationUuid = await this.checkAdmin(account);
        const result = await this.args.aiIdentityModel.listEvents(
            organizationUuid,
            page,
            pageSize,
            null,
            includeReads,
            exclusionAccountUuid,
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
        let automaticSyncRefusal = false;
        let automaticSyncReason = AI_IDENTITY_SYNC_UNSAFE_MESSAGE;
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
            const sync = await this.args.aiIdentityModel.getAutomaticSync(
                identityAccount.aiIdentityAccountUuid,
            );
            automaticSyncRefusal = sync.pending;
            try {
                const connection = await this.provisionerConnection(
                    identityAccount.aiIdentityAccountUuid,
                );
                const run = await connection.readAutomaticSync();
                if (!run.hasLog && sync.lastRunAt)
                    run.lastRunAt = sync.lastRunAt;
                if (run.hasLog)
                    await this.args.aiIdentityModel.recordAutomaticSync(
                        identityAccount.aiIdentityAccountUuid,
                        run,
                    );
                const completedAfterChange =
                    run.status === AiIdentitySyncStatus.OK &&
                    (sync.lastRunAt === null || run.lastRunAt > sync.lastRunAt);
                if (sync.pending && completedAfterChange)
                    await this.args.aiIdentityModel.setAutomaticSyncPending(
                        identityAccount.aiIdentityAccountUuid,
                        false,
                    );
                const unsafeReason = aiIdentityAutomaticSyncUnsafeReason(
                    run,
                    new Date(),
                );
                automaticSyncRefusal =
                    (sync.pending && !completedAfterChange) ||
                    unsafeReason !== null;
                if (unsafeReason === 'schema_changed')
                    automaticSyncReason = AI_IDENTITY_SCHEMA_CHANGED_MESSAGE;
            } catch {
                automaticSyncRefusal = true;
            }
        }
        const state = !aiIdentityRequired
            ? null
            : (identity?.state ?? AiIdentityState.NEEDS_SIGN_IN);
        let action: AiAccessForUser['action'] = null;
        if (automaticSyncRefusal) action = 'ask_admin';
        else if (state === AiIdentityState.NEEDS_SIGN_IN) action = 'sign_in';
        else if (state !== null && state !== AiIdentityState.READY)
            action = 'ask_admin';
        let message: string | null;
        if (automaticSyncRefusal) message = automaticSyncReason;
        else if (state === null || state === AiIdentityState.READY)
            message = null;
        else message = getAiIdentityPersonMessage(state);
        return {
            projectUuid,
            restrictionsOn,
            warehouseType: credentials.type,
            aiIdentityRequired,
            automaticSyncRefusal,
            state,
            aiIdentityName: identity?.twinName ?? null,
            lastCheckedAt: identity?.checkedAt ?? null,
            action,
            message,
            rawSqlAllowed:
                !restrictionsOn ||
                (aiIdentityRequired &&
                    state === AiIdentityState.READY &&
                    !automaticSyncRefusal),
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
            let peopleAffected: number | null = null;
            if (job.kind === AiIdentityJobKind.SYNC) await this.runSync(job);
            if (job.kind === AiIdentityJobKind.PROVISION)
                peopleAffected = await this.runProvisioningJob(job);
            if (job.kind === AiIdentityJobKind.TEST) {
                await this.runTest(job);
                if (job.createdByUserUuid === null)
                    await this.checkScheduledProvisionerSchemas(
                        job.aiIdentityAccountUuid,
                    );
            }
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
                aiIdentityJobUuid: jobUuid,
                actorType: 'scheduler',
                actorUserUuid: null,
                action: job.kind,
                targetCount: peopleAffected ?? finished?.done ?? 0,
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
                aiIdentityJobUuid: jobUuid,
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
        job: AiIdentityJob & {
            filter: AiIdentityFilter;
            organizationUuid: string;
        },
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
                    const result = await this.testIdentityByUuid(id);
                    await this.args.aiIdentityModel.addEvent({
                        organizationUuid: job.organizationUuid,
                        aiIdentityAccountUuid: result.aiIdentityAccountUuid,
                        aiIdentityUuid: id,
                        actorType: 'scheduler',
                        actorUserUuid: null,
                        action: 'tested',
                        targetCount: 1,
                        status:
                            result.state === AiIdentityState.READY
                                ? 'success'
                                : 'error',
                        detail: result.state,
                    });
                } catch (error) {
                    this.logger.warn('AI identity check failed', {
                        aiIdentityUuid: id,
                        error,
                    });
                    await this.args.aiIdentityModel.addEvent({
                        organizationUuid: job.organizationUuid,
                        aiIdentityAccountUuid: job.filter.aiIdentityAccountUuid,
                        aiIdentityUuid: id,
                        actorType: 'scheduler',
                        actorUserUuid: null,
                        action: 'tested',
                        targetCount: 1,
                        status: 'error',
                        detail: 'failed',
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
        const loadAll = async (
            filter: AiIdentityFilter,
        ): Promise<AiIdentity[]> => {
            const rows: AiIdentity[] = [];
            const loadPage = async (page: number): Promise<void> => {
                const result = await this.args.aiIdentityModel.list(
                    filter,
                    AiIdentitySort.NAME,
                    'asc',
                    page,
                    100,
                );
                rows.push(...result.data);
                if (
                    rows.length < result.pagination.totalResults &&
                    result.data.length > 0
                )
                    await loadPage(page + 1);
            };
            await loadPage(1);
            return rows;
        };
        const identities = await loadAll(job.filter);
        const notSignedIn =
            job.filter.states.length > 0 &&
            !job.filter.states.includes(AiIdentityState.NEEDS_SIGN_IN)
                ? await loadAll({
                      ...job.filter,
                      states: [AiIdentityState.NEEDS_SIGN_IN],
                      reasons: [],
                  })
                : [];
        const roleCannotBeFilled = (identity: AiIdentity): boolean =>
            Boolean(
                (job.roleForTwin?.includes(SNOWFLAKE_LOGIN_PLACEHOLDER) &&
                    identity.snowflakeLogin === null) ||
                (job.roleForTwin?.includes(AI_IDENTITY_NAME_PLACEHOLDER) &&
                    identity.twinName === null),
            );
        const skipped = [
            ...identities
                .filter(roleCannotBeFilled)
                .map(({ email, twinName }) => ({
                    email,
                    reason:
                        twinName === null
                            ? 'no Snowflake login recorded; ask them to sign in to Snowflake or set an AI identity name'
                            : 'no Snowflake login recorded, so the role template could not be filled; ask them to sign in to Snowflake or use {ai_identity_name} in the role template',
                })),
            ...notSignedIn.map(({ email }) => ({
                email,
                reason: 'no Snowflake login recorded; ask them to sign in to Snowflake or set an AI identity name',
            })),
        ];
        const exportIdentities = skipped.length
            ? identities.filter((identity) => !roleCannotBeFilled(identity))
            : identities;
        let url: string;
        if (job.format === 'sql') {
            url = await this.args.fileStorageClient.uploadTextFile(
                Buffer.from(
                    job.filter.reasons.length === 1 &&
                        job.filter.reasons[0] ===
                            AiIdentityFailureReason.KEY_OR_USER_REJECTED
                        ? [
                              ...skipped.map(
                                  ({ email, reason }) =>
                                      `-- Skipped ${email}: ${reason}`,
                              ),
                              ...exportIdentities.flatMap((identity) => {
                                  const roleTemplate = job.roleForTwin;
                                  const role =
                                      roleTemplate !== null &&
                                      (!roleTemplate.includes(
                                          SNOWFLAKE_LOGIN_PLACEHOLDER,
                                      ) ||
                                          identity.snowflakeLogin !== null) &&
                                      (!roleTemplate.includes(
                                          AI_IDENTITY_NAME_PLACEHOLDER,
                                      ) ||
                                          identity.twinName !== null)
                                          ? resolveAiIdentityRole(
                                                roleTemplate,
                                                identity.snowflakeLogin,
                                                identity.twinName,
                                            )
                                          : null;
                                  const sql = buildAiIdentityFixSql({
                                      reason: AiIdentityFailureReason.KEY_OR_USER_REJECTED,
                                      twinName: identity.twinName,
                                      publicKey: identity.publicKey,
                                      roleForTwin: role,
                                      warehouse: null,
                                  });
                                  return sql === null ? [] : [sql];
                              }),
                          ].join('\n')
                        : buildAiTwinProvisioningSql({
                              identities: exportIdentities,
                              roleForTwin: job.roleForTwin,
                              skipped,
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
                Buffer.from(
                    JSON.stringify({ identities: exportIdentities, skipped }),
                ),
                job.jobUuid,
                'json',
            );
        }
        await this.args.aiIdentityModel.updateJob(job.jobUuid, {
            total: identities.length,
            done: identities.length,
            fileUrl: url,
            skipped,
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
        if (
            (await this.args.aiIdentityModel.getProvisioningMode(
                job.aiIdentityAccountUuid,
            )) === AiIdentityCreationMode.AUTOMATIC
        ) {
            await this.scheduleProvisioning(job.aiIdentityAccountUuid);
        }
    }

    private async checkScheduledProvisionerSchemas(
        aiIdentityAccountUuid: string,
    ): Promise<void> {
        const provisioner = await this.args.aiIdentityModel.getProvisioner(
            aiIdentityAccountUuid,
        );
        if (!provisioner) return;
        try {
            const roles = await this.args.aiIdentityModel.getAiRoles(
                aiIdentityAccountUuid,
            );
            const check = await this.checkUngrantedSchemas(
                aiIdentityAccountUuid,
                roles,
                provisioner.ungrantedSchemas ?? [],
            );
            await this.args.aiIdentityModel.updateProvisioner(
                aiIdentityAccountUuid,
                {
                    ungrantedSchemas: check.results,
                    ...(check.error !== null &&
                    check.error !== provisioner.statusMessage
                        ? { statusMessage: check.error }
                        : {}),
                },
            );
        } catch (cause) {
            const message =
                cause instanceof Error ? cause.message : String(cause);
            if (message !== provisioner.statusMessage)
                await this.args.aiIdentityModel.updateProvisioner(
                    aiIdentityAccountUuid,
                    {
                        statusMessage: message,
                    },
                );
        }
    }

    async scheduleDailyChecks(): Promise<void> {
        const accounts = await this.args.aiIdentityModel.listAllAccounts();
        await forEachSequential(accounts, async (account) => {
            const mode = await this.args.aiIdentityModel.getProvisioningMode(
                account.aiIdentityAccountUuid,
            );
            if (mode === AiIdentityCreationMode.AUTOMATIC)
                await this.scheduleProvisioning(account.aiIdentityAccountUuid);
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

    async scheduleSyncForOrganization(organizationUuid: string): Promise<void> {
        const projects =
            await this.args.projectModel.getAllByOrganizationUuid(
                organizationUuid,
            );
        const accounts =
            await this.args.aiIdentityModel.listAccounts(organizationUuid);
        const automaticAccounts = new Set(
            accounts
                .filter(
                    (account) =>
                        account.effectiveMode ===
                        AiIdentityCreationMode.AUTOMATIC,
                )
                .map((account) => account.snowflakeAccount),
        );
        await forEachSequential(projects, async (project) => {
            if (project.warehouseType === WarehouseTypes.SNOWFLAKE) {
                const credentials = await this.getOriginalConnectionCredentials(
                    project.projectUuid,
                );
                if (
                    credentials.type === WarehouseTypes.SNOWFLAKE &&
                    automaticAccounts.has(
                        normalizeSnowflakeAccount(credentials.account),
                    )
                ) {
                    await this.scheduleSyncForProject(
                        organizationUuid,
                        project.projectUuid,
                    );
                }
            }
        });
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
    async getMyAiIdentities(account: Account): Promise<
        Array<{
            aiIdentityAccountUuid: string;
            accountLabel: string;
            aiIdentityName: string | null;
            state: AiIdentityState;
            lastCheckedAt: Date | null;
            action: AiAccessForUser['action'];
            message: string | null;
        }>
    > {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) throw new ForbiddenError();
        const flag = await this.args.featureFlagModel.get({
            featureFlagId: FeatureFlags.SnowflakeAiTwins,
            user: { organizationUuid, userUuid: account.user.id },
        });
        if (!flag.enabled) return [];
        const accounts =
            await this.args.aiIdentityModel.listAccounts(organizationUuid);
        const identities = await Promise.all(
            accounts.map(async (identityAccount) => {
                const identity = await this.args.aiIdentityModel.find({
                    aiIdentityAccountUuid:
                        identityAccount.aiIdentityAccountUuid,
                    userUuid: account.user.id,
                });
                const state = identity?.state ?? AiIdentityState.NEEDS_SIGN_IN;
                let action: AiAccessForUser['action'] = null;
                if (state === AiIdentityState.NEEDS_SIGN_IN) action = 'sign_in';
                else if (state !== AiIdentityState.READY) action = 'ask_admin';
                return {
                    aiIdentityAccountUuid:
                        identityAccount.aiIdentityAccountUuid,
                    accountLabel: identityAccount.snowflakeAccount,
                    aiIdentityName: identity?.twinName ?? null,
                    state,
                    lastCheckedAt: identity?.checkedAt ?? null,
                    action,
                    message:
                        state === AiIdentityState.READY
                            ? null
                            : getAiIdentityPersonMessage(state),
                };
            }),
        );
        return identities;
    }
}
