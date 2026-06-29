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
    createBranch,
    createPullRequest,
    createSignedCommitOnBranch,
    getFileContent,
    getInstallationToken,
    getLastCommit,
} from '../../../clients/github/Github';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { ProjectContextModel } from '../../models/ProjectContextModel';
import {
    projectContextFilePath,
    ProjectContextService,
} from './ProjectContextService';

vi.mock('../../../clients/github/Github', () => ({
    getFileContent: vi.fn(),
    getInstallationToken: vi.fn(),
    getLastCommit: vi.fn(),
    createBranch: vi.fn(),
    createSignedCommitOnBranch: vi.fn(),
    createPullRequest: vi.fn(),
}));

const mockGetFileContent = getFileContent as import('vitest').Mock;
const mockGetInstallationToken = getInstallationToken as import('vitest').Mock;
const mockGetLastCommit = getLastCommit as import('vitest').Mock;
const mockCreateBranch = createBranch as import('vitest').Mock;
const mockCreateSignedCommitOnBranch =
    createSignedCommitOnBranch as import('vitest').Mock;
const mockCreatePullRequest = createPullRequest as import('vitest').Mock;

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
        get: vi.fn().mockResolvedValue(overrides.project ?? githubProject),
        getSummary: vi.fn().mockResolvedValue(
            overrides.projectSummary ?? {
                organizationUuid: ORG_UUID,
                projectUuid: PROJECT_UUID,
                type: undefined,
            },
        ),
    } as unknown as ProjectModel;
    const githubAppInstallationsModel = {
        findInstallationId: vi
            .fn()
            .mockResolvedValue(
                'installationId' in overrides
                    ? overrides.installationId
                    : 'install-1',
            ),
    } as unknown as GithubAppInstallationsModel;
    const projectContextModel = {
        replaceEntriesForProject: vi.fn(
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
    vi.clearAllMocks();
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

describe('ProjectContextService.writebackEntry', () => {
    const judgeEntry = {
        op: 'create' as const,
        id: null,
        kind: 'definition' as const,
        content: '"HR" = high-risk cohort.',
        terms: ['HR'],
        objects: [],
    };

    beforeEach(() => {
        mockGetLastCommit.mockResolvedValue({ sha: 'base-sha' });
        mockCreateBranch.mockResolvedValue({});
        mockCreateSignedCommitOnBranch.mockResolvedValue({
            oid: 'commit-sha',
            url: 'https://github.com/acme/analytics/commit/commit-sha',
        });
        mockCreatePullRequest.mockResolvedValue({
            html_url: 'https://github.com/acme/analytics/pull/7',
            number: 7,
        });
    });

    test('creates the file and opens a PR when it does not yet exist', async () => {
        mockGetFileContent.mockRejectedValue(new NotFoundError('missing'));
        const { service } = makeService({});

        const result = await service.writebackEntry({
            projectUuid: PROJECT_UUID,
            entry: judgeEntry,
            branchTimestamp: 1000,
            sourceThread: null,
        });

        expect(result).toEqual({
            prUrl: 'https://github.com/acme/analytics/pull/7',
            prNumber: 7,
            owner: 'acme',
            repo: 'analytics',
            op: 'create',
            entryId: 'hr',
        });
        expect(mockCreateSignedCommitOnBranch).toHaveBeenCalledTimes(1);
        const commitArgs = mockCreateSignedCommitOnBranch.mock.calls[0][0];
        expect(commitArgs).toMatchObject({
            branch: 'lightdash-project-context/hr-1000',
            expectedHeadOid: 'base-sha',
        });
        expect(commitArgs.fileChanges.additions[0].path).toBe(
            'lightdash.project_context.yml',
        );
        expect(mockCreateBranch).toHaveBeenCalledWith(
            expect.objectContaining({
                sha: 'base-sha',
                branch: 'lightdash-project-context/hr-1000',
            }),
        );
    });

    test('updates the existing file when present and reports op=update', async () => {
        mockGetFileContent.mockResolvedValue({
            content: `
- id: hr
  kind: definition
  content: old
  terms: [HR]
`,
            sha: 'file-sha',
        });
        const { service } = makeService({});

        const result = await service.writebackEntry({
            projectUuid: PROJECT_UUID,
            entry: { ...judgeEntry, op: 'update', id: 'hr' },
            branchTimestamp: 2000,
            sourceThread: null,
        });

        expect(result.op).toBe('update');
        // op=update is decided by merging into the existing entry, not by a
        // file SHA — the signed commit overwrites the file either way.
        const commitArgs = mockCreateSignedCommitOnBranch.mock.calls[0][0];
        const updated = Buffer.from(
            commitArgs.fileChanges.additions[0].contents,
            'base64',
        ).toString('utf-8');
        expect(updated).toContain('"HR" = high-risk cohort.');
        expect(updated).not.toContain('content: old');
    });

    test('throws when the project has no GitHub access', async () => {
        const { service } = makeService({ installationId: undefined });
        await expect(
            service.writebackEntry({
                projectUuid: PROJECT_UUID,
                entry: judgeEntry,
                branchTimestamp: 1,
                sourceThread: null,
            }),
        ).rejects.toThrow(NotFoundError);
    });

    test('links the originating agent thread in the PR body', async () => {
        mockGetFileContent.mockRejectedValue(new NotFoundError('missing'));
        const { service } = makeService({});

        await service.writebackEntry({
            projectUuid: PROJECT_UUID,
            entry: judgeEntry,
            branchTimestamp: 1000,
            sourceThread: {
                threadUrl:
                    'https://app.lightdash.com/projects/p/ai-agents/a/threads/t',
                promptUuid: 'prompt-123',
                threadUuid: 't',
            },
        });

        const body = mockCreatePullRequest.mock.calls[0][0].body as string;
        expect(body).toContain(
            'https://app.lightdash.com/projects/p/ai-agents/a/threads/t',
        );
        expect(body).toContain('prompt-123');
    });
});
