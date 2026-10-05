import { subject } from '@casl/ability';
import {
    Account,
    AiIdentitiesSummary,
    AiIdentity,
    AiIdentitySettings,
    AiIdentityStatus,
    buildAiTwinProvisioningSql,
    FeatureFlags,
    fillAiTwinName,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    SNOWFLAKE_LOGIN_PLACEHOLDER,
    WarehouseTypes,
} from '@lightdash/common';
import { AiIdentityModel } from '../../models/AiIdentityModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { generateAiIdentityKeyPair } from '../../utils/aiIdentityKeys';
import { BaseService } from '../BaseService';
import {
    buildAiTwinCredentials,
    checkAiTwinConnection,
} from './aiTwinConnection';
import { getSnowflakeLogin } from './snowflakeLogin';

export class AiIdentityService extends BaseService {
    constructor(
        private readonly args: {
            aiIdentityModel: AiIdentityModel;
            projectModel: ProjectModel;
            featureFlagModel: FeatureFlagModel;
            userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
        },
    ) {
        super();
    }

    private async checkAccess(
        account: Account,
        projectUuid: string,
    ): Promise<string> {
        const project = await this.args.projectModel.get(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'update',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        )
            throw new ForbiddenError();
        const flag = await this.args.featureFlagModel.get({
            featureFlagId: FeatureFlags.SnowflakeAiTwins,
            user: { organizationUuid: project.organizationUuid },
        });
        if (!flag.enabled)
            throw new ForbiddenError('Snowflake AI identities are not enabled');
        if (project.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE) {
            throw new ParameterError(
                'AI identities require a Snowflake project',
            );
        }
        return project.organizationUuid;
    }

    async getSummary(
        account: Account,
        projectUuid: string,
    ): Promise<AiIdentitiesSummary> {
        const organizationUuid = await this.checkAccess(account, projectUuid);
        const [settings, identities, members] = await Promise.all([
            this.args.aiIdentityModel.getSettings(projectUuid),
            this.args.aiIdentityModel.list(projectUuid),
            this.args.aiIdentityModel.getProjectMembers({
                projectUuid,
                organizationUuid,
            }),
        ]);
        const existing = new Set(
            identities.map((identity) => identity.userUuid),
        );
        return {
            settings,
            identities,
            membersWithoutIdentity: members.filter(
                (member) => !existing.has(member.userUuid),
            ),
        };
    }

    async updateSettings(
        account: Account,
        projectUuid: string,
        settings: AiIdentitySettings,
    ): Promise<AiIdentitySettings> {
        await this.checkAccess(account, projectUuid);
        if (
            settings.twinNameTemplate !== null &&
            (!settings.twinNameTemplate.includes(SNOWFLAKE_LOGIN_PLACEHOLDER) ||
                !/^[A-Za-z0-9_$]+$/.test(
                    fillAiTwinName(settings.twinNameTemplate, 'LOGIN'),
                ))
        )
            throw new ParameterError(
                'AI user name template must contain {snowflake_login} and use only letters, numbers, _ or $',
            );
        const template = settings.twinNameTemplate;
        if (template !== null) {
            const identities =
                await this.args.aiIdentityModel.list(projectUuid);
            if (
                identities.some(
                    (identity) =>
                        identity.snowflakeLogin !== null &&
                        !/^[A-Za-z0-9_$]+$/.test(
                            fillAiTwinName(template, identity.snowflakeLogin),
                        ),
                )
            ) {
                throw new ParameterError(
                    'The template produces an invalid AI user name for an existing Snowflake login',
                );
            }
        }
        return this.args.aiIdentityModel.updateSettings(projectUuid, settings);
    }

    async provision(
        account: Account,
        projectUuid: string,
    ): Promise<AiIdentitiesSummary> {
        const summary = await this.getSummary(account, projectUuid);
        await Promise.all(
            summary.membersWithoutIdentity.map(({ userUuid }) => {
                const keyPair = generateAiIdentityKeyPair();
                return this.args.aiIdentityModel.create({
                    projectUuid,
                    userUuid,
                    snowflakeLogin: null,
                    publicKey: keyPair.publicKey,
                    privateKey: keyPair.privateKey,
                });
            }),
        );
        const projectCredentials =
            await this.args.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        if (
            projectCredentials.type === WarehouseTypes.SNOWFLAKE &&
            projectCredentials.requireUserCredentials === true
        ) {
            const identities =
                await this.args.aiIdentityModel.list(projectUuid);
            await identities.reduce<Promise<void>>(
                async (previous, identity) => {
                    await previous;
                    if (identity.snowflakeLogin === null) {
                        try {
                            const login = await getSnowflakeLogin({
                                projectUuid,
                                userUuid: identity.userUuid,
                                projectCredentials,
                                userWarehouseCredentialsModel:
                                    this.args.userWarehouseCredentialsModel,
                            });
                            if (login !== null) {
                                await this.args.aiIdentityModel.setSnowflakeLogin(
                                    identity.aiIdentityUuid,
                                    login,
                                );
                            }
                        } catch {
                            this.logger.warn(
                                'Could not read Snowflake login for AI identity',
                                { projectUuid, userUuid: identity.userUuid },
                            );
                        }
                    }
                },
                Promise.resolve(),
            );
        }
        return this.getSummary(account, projectUuid);
    }

    async regenerateKey(
        account: Account,
        projectUuid: string,
        userUuid: string,
    ): Promise<AiIdentity> {
        await this.checkAccess(account, projectUuid);
        const identity = await this.args.aiIdentityModel.find({
            projectUuid,
            userUuid,
        });
        if (!identity) throw new NotFoundError('AI identity not found');
        return this.args.aiIdentityModel.regenerateKey(
            identity.aiIdentityUuid,
            generateAiIdentityKeyPair(),
        );
    }

    async updateIdentity(
        account: Account,
        projectUuid: string,
        userUuid: string,
        twinNameOverride: string | null,
    ): Promise<AiIdentity> {
        await this.checkAccess(account, projectUuid);
        if (
            twinNameOverride !== null &&
            !/^[A-Za-z0-9_$]+$/.test(twinNameOverride)
        ) {
            throw new ParameterError(
                'AI user name must use only letters, numbers, _ or $',
            );
        }
        const identity = await this.args.aiIdentityModel.find({
            projectUuid,
            userUuid,
        });
        if (!identity) throw new NotFoundError('AI identity not found');
        return this.args.aiIdentityModel.setTwinNameOverride(
            identity.aiIdentityUuid,
            twinNameOverride,
        );
    }

    async testIdentity(
        account: Account,
        projectUuid: string,
        userUuid: string,
    ): Promise<AiIdentity> {
        await this.checkAccess(account, projectUuid);
        const identity = await this.args.aiIdentityModel.findWithPrivateKey({
            projectUuid,
            userUuid,
        });
        if (!identity) throw new NotFoundError('AI identity not found');
        if (!identity.twinName) {
            return this.args.aiIdentityModel.updateStatus(
                identity.aiIdentityUuid,
                {
                    status: AiIdentityStatus.FAILED,
                    statusMessage:
                        'No AI user name. Set a naming template or an override.',
                },
            );
        }
        const projectCredentials =
            await this.args.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        if (projectCredentials.type !== WarehouseTypes.SNOWFLAKE)
            throw new ParameterError(
                'AI identities require Snowflake credentials',
            );
        const result = await checkAiTwinConnection(
            buildAiTwinCredentials({
                projectCredentials,
                twinName: identity.twinName,
                privateKey: identity.privateKey,
            }),
        );
        return this.args.aiIdentityModel.updateStatus(identity.aiIdentityUuid, {
            status: result.ok
                ? AiIdentityStatus.READY
                : AiIdentityStatus.FAILED,
            statusMessage: result.ok ? null : result.message,
        });
    }

    async getProvisioningSql(
        account: Account,
        projectUuid: string,
        roleForTwin: string | null,
    ): Promise<string> {
        await this.checkAccess(account, projectUuid);
        if (roleForTwin !== null && !/^[A-Za-z0-9_$]+$/.test(roleForTwin))
            throw new ParameterError('Invalid Snowflake role');
        return buildAiTwinProvisioningSql({
            identities: await this.args.aiIdentityModel.list(projectUuid),
            roleForTwin,
        });
    }
}
