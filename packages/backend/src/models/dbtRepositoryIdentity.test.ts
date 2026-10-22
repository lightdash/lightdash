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
])('ignores malformed repository identity %j', (fields) => {
    expect(identity(fields)).toBeNull();
});
