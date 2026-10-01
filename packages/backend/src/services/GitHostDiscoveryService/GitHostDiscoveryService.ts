import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertUnreachable,
    ConnectionInputParseKind,
    FeatureFlags,
    ForbiddenError,
    getSemanticLayerFormat,
    GitHost,
    joinRepositoryPath,
    LightdashMode,
    NotFoundError,
    ParameterError,
    parseHostInput,
    ProjectType,
    type GitHostCredentials,
    type GitHostRepository,
    type RegisteredAccount,
    type SemanticLayerFormat,
} from '@lightdash/common';
import {
    getBranches as getGithubBranches,
    getFileContent as getGithubFileContent,
    listReposAccessibleToInstallation,
} from '../../clients/github/Github';
import { type LightdashConfig } from '../../config/parseConfig';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { BaseService } from '../BaseService';
import {
    fileExistsWithToken,
    listBranchesWithToken,
    listRepositoriesWithToken,
    type FetchFn,
    type RepositoryRef,
} from './gitHostApis';

type GitHostDiscoveryServiceArguments = {
    lightdashConfig: LightdashConfig;
    featureFlagModel: FeatureFlagModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    fetchFn?: FetchFn;
};

const DBT_PROJECT_FILE = 'dbt_project.yml';
const LIGHTDASH_CONFIG_FILE = 'lightdash.config.yml';

export class GitHostDiscoveryService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly fetchFn: FetchFn;

    constructor({
        lightdashConfig,
        featureFlagModel,
        githubAppInstallationsModel,
        fetchFn = fetch,
    }: GitHostDiscoveryServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.featureFlagModel = featureFlagModel;
        this.githubAppInstallationsModel = githubAppInstallationsModel;
        this.fetchFn = fetchFn;
    }

    private async authorize(account: RegisteredAccount): Promise<string> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const { enabled } = await this.featureFlagModel.get({
            user: { userUuid: account.user.userUuid, organizationUuid },
            featureFlagId: FeatureFlags.ConnectJourney,
        });
        if (!enabled) {
            throw new ForbiddenError('Git host discovery is not enabled');
        }
        if (
            this.createAuditedAbility(account).cannot(
                'create',
                subject('Project', {
                    organizationUuid,
                    type: ProjectType.DEFAULT,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return organizationUuid;
    }

    private normaliseCredentials(
        credentials: GitHostCredentials,
    ): GitHostCredentials {
        if (
            (credentials.host !== GitHost.GITLAB &&
                credentials.host !== GitHost.BITBUCKET) ||
            !credentials.hostDomain
        ) {
            return credentials;
        }
        const result = parseHostInput(credentials.hostDomain, {
            allowLocalHosts:
                this.lightdashConfig.mode !== LightdashMode.CLOUD_BETA,
            schemeAffectsTransport: false,
            fieldLabel: 'host URL',
        });
        switch (result.kind) {
            case ConnectionInputParseKind.UNCHANGED:
            case ConnectionInputParseKind.NORMALISED:
                return { ...credentials, hostDomain: result.value };
            case ConnectionInputParseKind.NEEDS_CONFIRMATION:
                throw new ParameterError(
                    `Enter only the host name, for example ${result.proposed}.`,
                );
            case ConnectionInputParseKind.BLOCKED:
                throw new ParameterError(result.reason);
            default:
                return assertUnreachable(result, 'Unknown host parse result');
        }
    }

    private async getInstallationId(organizationUuid: string) {
        const installationId =
            await this.githubAppInstallationsModel.findInstallationId(
                organizationUuid,
            );
        if (!installationId) {
            throw new NotFoundError(
                'Install the Lightdash GitHub App for your organization first.',
            );
        }
        return installationId;
    }

    async listRepositories(
        account: RegisteredAccount,
        credentials: GitHostCredentials,
    ): Promise<GitHostRepository[]> {
        const organizationUuid = await this.authorize(account);
        const normalised = this.normaliseCredentials(credentials);
        if (
            normalised.host === GitHost.GITHUB &&
            normalised.method === 'installation'
        ) {
            const repos = await listReposAccessibleToInstallation({
                installationId: await this.getInstallationId(organizationUuid),
            });
            return repos.map((repo) => ({
                id: `${repo.owner}/${repo.repo}`,
                owner: repo.owner,
                name: repo.repo,
                fullName: `${repo.owner}/${repo.repo}`,
                azureProject: null,
                defaultBranch: repo.defaultBranch,
            }));
        }
        return listRepositoriesWithToken(this.fetchFn, normalised);
    }

    async listBranches(
        account: RegisteredAccount,
        credentials: GitHostCredentials,
        repository: RepositoryRef,
    ): Promise<string[]> {
        const organizationUuid = await this.authorize(account);
        const normalised = this.normaliseCredentials(credentials);
        if (
            normalised.host === GitHost.GITHUB &&
            normalised.method === 'installation'
        ) {
            const [owner, repo] = repository.fullName.split('/');
            const branches = await getGithubBranches({
                owner,
                repo,
                installationId: await this.getInstallationId(organizationUuid),
            });
            return branches.map(({ name }) => name);
        }
        return listBranchesWithToken(this.fetchFn, normalised, repository);
    }

    private async fileExists(
        organizationUuid: string,
        credentials: GitHostCredentials,
        repository: RepositoryRef,
        branch: string,
        filePath: string,
    ): Promise<boolean> {
        if (
            credentials.host === GitHost.GITHUB &&
            credentials.method === 'installation'
        ) {
            const [owner, repo] = repository.fullName.split('/');
            try {
                await getGithubFileContent({
                    fileName: filePath,
                    owner,
                    repo,
                    branch,
                    installationId:
                        await this.getInstallationId(organizationUuid),
                });
                return true;
            } catch (error) {
                if (error instanceof NotFoundError) return false;
                throw error;
            }
        }
        return fileExistsWithToken(
            this.fetchFn,
            credentials,
            repository,
            branch,
            filePath,
        );
    }

    async detectFormat(
        account: RegisteredAccount,
        {
            credentials,
            repository,
            branch,
            subPath,
        }: {
            credentials: GitHostCredentials;
            repository: RepositoryRef;
            branch: string;
            subPath: string;
        },
    ): Promise<SemanticLayerFormat> {
        const organizationUuid = await this.authorize(account);
        const normalised = this.normaliseCredentials(credentials);
        if (subPath.split('/').includes('..')) {
            throw new ParameterError(
                'The project path must stay inside the repository.',
            );
        }
        const [hasDbtProject, hasLightdashConfig] = await Promise.all(
            [DBT_PROJECT_FILE, LIGHTDASH_CONFIG_FILE].map((fileName) =>
                this.fileExists(
                    organizationUuid,
                    normalised,
                    repository,
                    branch,
                    joinRepositoryPath(subPath, fileName),
                ),
            ),
        );
        return getSemanticLayerFormat({ hasDbtProject, hasLightdashConfig });
    }
}
