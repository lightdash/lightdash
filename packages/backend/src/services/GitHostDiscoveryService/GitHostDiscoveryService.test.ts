import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    GitHost,
    LightdashMode,
    ParameterError,
    SemanticLayerFormat,
    type PossibleAbilities,
    type RegisteredAccount,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { buildAccount } from '../ProjectService/ProjectService.mock';
import { type FetchFn } from './gitHostApis';
import { GitHostDiscoveryService } from './GitHostDiscoveryService';

const organizationUuid = 'organization-uuid';

const buildCreator = (canCreate: boolean): RegisteredAccount => {
    const account = buildAccount() as RegisteredAccount;
    return {
        ...account,
        user: {
            ...account.user,
            ability: new Ability<PossibleAbilities>(
                canCreate ? [{ subject: 'Project', action: 'create' }] : [],
            ),
        },
        organization: { ...account.organization, organizationUuid },
    } as RegisteredAccount;
};

const buildService = ({
    enabled = true,
    fetchFn = vi.fn(async () => new Response('[]')) as unknown as FetchFn,
}: { enabled?: boolean; fetchFn?: FetchFn } = {}) =>
    new GitHostDiscoveryService({
        lightdashConfig: {
            ...lightdashConfigMock,
            mode: LightdashMode.CLOUD_BETA,
        },
        featureFlagModel: {
            get: vi.fn(async () => ({
                id: FeatureFlags.ConnectJourney,
                enabled,
            })),
        } as unknown as FeatureFlagModel,
        githubAppInstallationsModel: {
            findInstallationId: vi.fn(async () => undefined),
        } as unknown as GithubAppInstallationsModel,
        fetchFn,
    });

const gitlab = {
    host: GitHost.GITLAB,
    token: 'glpat',
    hostDomain: null,
} as const;

describe('GitHostDiscoveryService', () => {
    it('is refused when the flag is off', async () => {
        await expect(
            buildService({ enabled: false }).listRepositories(
                buildCreator(true),
                gitlab,
            ),
        ).rejects.toThrow('Git host discovery is not enabled');
    });

    it('needs permission to create a project', async () => {
        await expect(
            buildService().listRepositories(buildCreator(false), gitlab),
        ).rejects.toThrow(ForbiddenError);
    });

    it('blocks a local GitLab host on Cloud before any request', async () => {
        const fetchFn = vi.fn() as unknown as FetchFn;
        await expect(
            buildService({ fetchFn }).listRepositories(buildCreator(true), {
                ...gitlab,
                hostDomain: 'localhost',
            }),
        ).rejects.toThrow(ParameterError);
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('asks for a bare host name instead of a URL with a path', async () => {
        await expect(
            buildService().listRepositories(buildCreator(true), {
                ...gitlab,
                hostDomain: 'https://gitlab.example.com/group',
            }),
        ).rejects.toThrow(
            'Enter only the host name, for example gitlab.example.com.',
        );
    });

    it('explains a missing GitHub App installation', async () => {
        await expect(
            buildService().listRepositories(buildCreator(true), {
                host: GitHost.GITHUB,
                method: 'installation',
            }),
        ).rejects.toThrow('Install the Lightdash GitHub App');
    });

    it('detects a dbt project in a subdirectory', async () => {
        const fetchFn = vi.fn(async (input: string | URL | Request) =>
            String(input).includes('dbt_project.yml')
                ? new Response('name: x')
                : new Response('', { status: 404 }),
        ) as unknown as FetchFn;

        await expect(
            buildService({ fetchFn }).detectFormat(buildCreator(true), {
                credentials: gitlab,
                repository: {
                    id: '1',
                    fullName: 'acme/analytics',
                    azureProject: null,
                },
                branch: 'main',
                subPath: '/dbt',
            }),
        ).resolves.toBe(SemanticLayerFormat.DBT);
    });

    it('refuses a project path that leaves the repository', async () => {
        await expect(
            buildService().detectFormat(buildCreator(true), {
                credentials: gitlab,
                repository: {
                    id: '1',
                    fullName: 'acme/analytics',
                    azureProject: null,
                },
                branch: 'main',
                subPath: '../other',
            }),
        ).rejects.toThrow('must stay inside the repository');
    });
});
