import { Ability, AbilityBuilder } from '@casl/ability';
import {
    DbtProjectType,
    ForbiddenError,
    NotFoundError,
    type MemberAbility,
    type ProjectContextEntry,
    type SessionUser,
} from '@lightdash/common';
import {
    getFileContent,
    getInstallationToken,
} from '../../../clients/github/Github';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { ProjectContextModel } from '../../models/ProjectContextModel';
import {
    projectContextFilePath,
    ProjectContextService,
} from './ProjectContextService';

jest.mock('../../../clients/github/Github', () => ({
    getFileContent: jest.fn(),
    getInstallationToken: jest.fn(),
}));

const mockGetFileContent = getFileContent as jest.Mock;
const mockGetInstallationToken = getInstallationToken as jest.Mock;

const PROJECT_UUID = '00000000-0000-0000-0000-000000000001';
const ORG_UUID = '00000000-0000-0000-0000-000000000002';
const USER_UUID = '00000000-0000-0000-0000-000000000003';

const githubProject = {
    organizationUuid: ORG_UUID,
    dbtConnection: {
        type: DbtProjectType.GITHUB,
        repository: 'acme/analytics',
        branch: 'main',
        project_sub_path: '/',
    },
};

const existingEntries = (): ProjectContextEntry[] => [
    {
        id: 'existing',
        kind: 'context',
        content: 'Existing cached context.',
        terms: [],
        objects: [],
    },
];

const userWithIngestAccess = (canManage: boolean = true): SessionUser => {
    const { build, can, rules } = new AbilityBuilder<MemberAbility>(Ability);
    if (canManage) {
        can('manage', 'CompileProject', {
            organizationUuid: ORG_UUID,
            projectUuid: PROJECT_UUID,
        });
    }

    return {
        userUuid: USER_UUID,
        organizationUuid: ORG_UUID,
        organizationName: 'Acme',
        organizationCreatedAt: new Date(),
        role: 'admin',
        ability: build(),
        abilityRules: rules,
    } as SessionUser;
};

const makeService = (overrides: {
    project?: unknown;
    projectSummary?: unknown;
    installationId?: string | undefined;
    initialEntries?: ProjectContextEntry[];
}) => {
    let cachedEntries = overrides.initialEntries ?? existingEntries();
    const projectModel = {
        get: jest.fn().mockResolvedValue(overrides.project ?? githubProject),
        getSummary: jest.fn().mockResolvedValue(
            overrides.projectSummary ?? {
                organizationUuid: ORG_UUID,
                projectUuid: PROJECT_UUID,
                type: undefined,
            },
        ),
    } as unknown as ProjectModel;
    const githubAppInstallationsModel = {
        findInstallationId: jest
            .fn()
            .mockResolvedValue(
                'installationId' in overrides
                    ? overrides.installationId
                    : 'install-1',
            ),
    } as unknown as GithubAppInstallationsModel;
    const projectContextModel = {
        replaceEntriesForProject: jest.fn(
            async (_projectUuid: string, entries: ProjectContextEntry[]) => {
                cachedEntries = entries;
            },
        ),
    } as unknown as ProjectContextModel;
    const service = new ProjectContextService({
        projectModel,
        githubAppInstallationsModel,
        projectContextModel,
    });
    return { service, getCachedEntries: () => cachedEntries };
};

beforeEach(() => {
    jest.clearAllMocks();
    mockGetInstallationToken.mockResolvedValue('token-1');
});

describe('projectContextFilePath', () => {
    test.each([
        ['/', 'lightdash.project_context.yml'],
        ['./', 'lightdash.project_context.yml'],
        ['/transform/dbt', 'transform/dbt/lightdash.project_context.yml'],
        ['transform/dbt/', 'transform/dbt/lightdash.project_context.yml'],
    ])('resolves %s', (projectSubPath, filePath) => {
        expect(projectContextFilePath(projectSubPath)).toBe(filePath);
    });
});

describe('ProjectContextService.ingestProjectContext', () => {
    test('requires compile-project access', async () => {
        const { service, getCachedEntries } = makeService({});

        await expect(
            service.ingestProjectContext(
                userWithIngestAccess(false),
                PROJECT_UUID,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(getCachedEntries()).toEqual(existingEntries());
    });

    test('no-op when the project is not GitHub-backed', async () => {
        const { service, getCachedEntries } = makeService({
            project: {
                organizationUuid: ORG_UUID,
                dbtConnection: { type: DbtProjectType.DBT },
            },
        });
        const result = await service.ingestProjectContext(
            userWithIngestAccess(),
            PROJECT_UUID,
        );
        expect(result).toEqual({
            ingested: false,
            reason: 'no_github_access',
        });
        expect(getCachedEntries()).toEqual(existingEntries());
    });

    test('no-op when the org has no GitHub App installation', async () => {
        const { service, getCachedEntries } = makeService({
            installationId: undefined,
        });
        const result = await service.ingestProjectContext(
            userWithIngestAccess(),
            PROJECT_UUID,
        );
        expect(result).toEqual({
            ingested: false,
            reason: 'no_github_access',
        });
        expect(getCachedEntries()).toEqual(existingEntries());
    });

    test('clears entries when the file is not found', async () => {
        mockGetFileContent.mockRejectedValue(new NotFoundError('missing'));
        const { service, getCachedEntries } = makeService({});
        const result = await service.ingestProjectContext(
            userWithIngestAccess(),
            PROJECT_UUID,
        );
        expect(result).toEqual({ ingested: true, entryCount: 0 });
        expect(getCachedEntries()).toEqual([]);
    });

    test('parses and replaces entries when the file is present', async () => {
        mockGetFileContent.mockResolvedValue({
            content: `
- id: hr
  kind: definition
  content: '"HR" = high-risk cohort.'
  terms: [HR]
`,
            sha: 'abc',
        });
        const { service, getCachedEntries } = makeService({});
        const result = await service.ingestProjectContext(
            userWithIngestAccess(),
            PROJECT_UUID,
        );
        expect(result).toEqual({ ingested: true, entryCount: 1 });
        expect(getCachedEntries()).toEqual([
            {
                id: 'hr',
                kind: 'definition',
                content: '"HR" = high-risk cohort.',
                terms: ['HR'],
                objects: [],
            },
        ]);
    });

    test('does not wipe entries on a transient GitHub error', async () => {
        mockGetFileContent.mockRejectedValue(new Error('500 from GitHub'));
        const { service, getCachedEntries } = makeService({});
        await expect(
            service.ingestProjectContext(userWithIngestAccess(), PROJECT_UUID),
        ).rejects.toThrow('500 from GitHub');
        expect(getCachedEntries()).toEqual(existingEntries());
    });
});
