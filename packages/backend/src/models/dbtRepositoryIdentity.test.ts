import { type DbtProjectConfig } from '@lightdash/common';
import { dbtRepositoryIdentity } from './dbtRepositoryIdentity';

const identity = (fields: Record<string, unknown>) =>
    dbtRepositoryIdentity({
        type: 'github',
        repository: 'Group/Repo.git',
        branch: 'Main',
        ...fields,
    } as DbtProjectConfig);

test.each([
    [
        {},
        {
            provider: 'github',
            host: 'github.com',
            owner: 'group',
            name: 'repo',
            defaultBranch: 'Main',
        },
    ],
    [
        { repository: 'https://GIT.EXAMPLE.TEST:8443/Group/Repo.git?ref=main' },
        { host: 'git.example.test:8443', owner: 'group', name: 'repo' },
    ],
    [
        { repository: 'git@git.example.test:Group/Repo.git' },
        { host: 'git.example.test', owner: 'group', name: 'repo' },
    ],
    [
        { type: 'gitlab', repository: 'Group/Subgroup/Repo.git' },
        { host: 'gitlab.com', owner: 'group/subgroup', name: 'repo' },
    ],
    [
        {
            type: 'azure_devops',
            repository: 'Repo.git',
            organization: ' Organization ',
            project: ' Project ',
        },
        { host: 'dev.azure.com', owner: 'organization/project', name: 'repo' },
    ],
])('canonicalizes repository coordinates %j', (fields, expected) => {
    expect(identity(fields)).toMatchObject(expected);
});

test.each([
    { repository: 'https://' },
    { repository: 'Group/Subgroup/Repo' },
    { type: 'gitlab', repository: 'Group//Repo' },
    { host_domain: '.' },
    { repository: 'Repo' },
    { repository: null },
    { repository: 42 },
    { repository: {} },
    { host_domain: 42 },
    { type: 'none' },
    { type: 'manual' },
    { type: 'azure_devops', organization: null, project: 'Project' },
    { type: 'azure_devops', organization: 'Org', project: {} },
    { type: 'azure_devops', organization: 'Org/Other', project: 'Project' },
])('ignores malformed repository identity %j', (fields) => {
    expect(identity(fields)).toBeNull();
});

test.each([null, undefined, [], true, 'repository'])(
    'ignores malformed stored connection %j',
    (connection) => {
        expect(
            dbtRepositoryIdentity(connection as unknown as DbtProjectConfig),
        ).toBeNull();
    },
);

test('normalizes a missing branch without making up a default', () => {
    expect(identity({ branch: undefined })).toMatchObject({
        defaultBranch: null,
    });
});

test('retains valid spaces in Azure project coordinates', () => {
    expect(
        identity({
            type: 'azure_devops',
            repository: 'Repo.git',
            organization: 'Organization',
            project: 'My Project',
        }),
    ).toMatchObject({ owner: 'organization/my project', name: 'repo' });
});
