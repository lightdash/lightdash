import { describe, expect, it } from 'vitest';
import {
    buildGitDbtConnection,
    getGitHostTileLabels,
    getSemanticLayerFormat,
    GitHost,
    joinRepositoryPath,
    SemanticLayerFormat,
    supportsNativeLightdashYaml,
} from './gitHostDiscovery';
import { DbtProjectType } from './projects';

const repository = {
    fullName: 'acme-data/analytics',
    name: 'analytics',
    azureProject: null,
};

describe('getSemanticLayerFormat', () => {
    it.each([
        [true, false, SemanticLayerFormat.DBT],
        [false, true, SemanticLayerFormat.LIGHTDASH],
        [true, true, SemanticLayerFormat.BOTH],
        [false, false, SemanticLayerFormat.NEITHER],
    ])(
        'dbt=%s lightdash=%s is %s',
        (hasDbtProject, hasLightdashConfig, format) => {
            expect(
                getSemanticLayerFormat({ hasDbtProject, hasLightdashConfig }),
            ).toBe(format);
        },
    );
});

describe('joinRepositoryPath', () => {
    it.each([
        ['/', 'dbt_project.yml'],
        ['', 'dbt_project.yml'],
        ['/analytics/', 'analytics/dbt_project.yml'],
        ['analytics/dbt', 'analytics/dbt/dbt_project.yml'],
    ])('joins %s', (subPath, expected) => {
        expect(joinRepositoryPath(subPath, 'dbt_project.yml')).toBe(expected);
    });
});

describe('getGitHostTileLabels', () => {
    it('labels nothing missing for GitHub', () => {
        expect(getGitHostTileLabels(GitHost.GITHUB)).toEqual([]);
    });

    it('groups what Azure DevOps lacks into one line for each reason', () => {
        expect(getGitHostTileLabels(GitHost.AZURE_DEVOPS)).toEqual([
            'Not on Azure DevOps: write-back and pull requests, previews from pull requests',
            'Not available yet: extra semantic layer connections, native Lightdash YAML',
        ]);
    });

    it('marks planned features as not available yet', () => {
        expect(getGitHostTileLabels(GitHost.GITLAB)).toEqual([
            'Not available yet: previews from pull requests, extra semantic layer connections, native Lightdash YAML',
        ]);
    });
});

describe('supportsNativeLightdashYaml', () => {
    it('allows Bitbucket Cloud but not Data Center', () => {
        expect(
            supportsNativeLightdashYaml({
                host: GitHost.BITBUCKET,
                username: 'u',
                token: 't',
                hostDomain: null,
            }),
        ).toBe(true);
        expect(
            supportsNativeLightdashYaml({
                host: GitHost.BITBUCKET,
                username: 'u',
                token: 't',
                hostDomain: 'git.example.com',
            }),
        ).toBe(false);
    });
});

describe('buildGitDbtConnection', () => {
    it('uses the GitHub App installation', () => {
        expect(
            buildGitDbtConnection({
                credentials: { host: GitHost.GITHUB, method: 'installation' },
                repository,
                branch: 'main',
                subPath: '',
                semanticLayer: 'dbt',
                githubInstallationId: '42',
            }),
        ).toEqual({
            type: DbtProjectType.GITHUB,
            authorization_method: 'installation_id',
            installation_id: '42',
            repository: 'acme-data/analytics',
            branch: 'main',
            project_sub_path: '/',
            semanticLayer: 'dbt',
        });
    });

    it('stores a GitLab token and self-managed host on the project', () => {
        expect(
            buildGitDbtConnection({
                credentials: {
                    host: GitHost.GITLAB,
                    token: 'glpat',
                    hostDomain: 'gitlab.example.com',
                },
                repository,
                branch: 'develop',
                subPath: 'dbt',
                semanticLayer: 'dbt',
                githubInstallationId: null,
            }),
        ).toEqual({
            type: DbtProjectType.GITLAB,
            personal_access_token: 'glpat',
            repository: 'acme-data/analytics',
            branch: 'develop',
            project_sub_path: 'dbt',
            host_domain: 'gitlab.example.com',
        });
    });

    it('uses the Azure DevOps project of the picked repository', () => {
        expect(
            buildGitDbtConnection({
                credentials: {
                    host: GitHost.AZURE_DEVOPS,
                    organization: 'acme',
                    token: 'pat',
                },
                repository: {
                    fullName: 'Data/analytics',
                    name: 'analytics',
                    azureProject: 'Data',
                },
                branch: 'main',
                subPath: '/',
                semanticLayer: 'dbt',
                githubInstallationId: null,
            }),
        ).toMatchObject({
            type: DbtProjectType.AZURE_DEVOPS,
            organization: 'acme',
            project: 'Data',
            repository: 'analytics',
        });
    });
});
