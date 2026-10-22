import { DbtProjectType, type DbtProjectConfig } from '@lightdash/common';

export const dbtRepositoryIdentity = (connection: DbtProjectConfig) => {
    if (!('repository' in connection)) return null;
    const provider = connection.type;
    let repository = connection.repository.trim().replace(/\.git$/i, '');
    let host: string;
    let owner: string;
    let name: string;
    if (provider === DbtProjectType.AZURE_DEVOPS) {
        host = 'dev.azure.com';
        owner = `${connection.organization.trim()}/${connection.project.trim()}`;
        name = repository;
    } else {
        const defaults = {
            [DbtProjectType.GITHUB]: 'github.com',
            [DbtProjectType.GITLAB]: 'gitlab.com',
            [DbtProjectType.BITBUCKET]: 'bitbucket.org',
        };
        host = connection.host_domain?.trim() || defaults[provider];
        if (/^https?:\/\//i.test(repository)) {
            try {
                const url = new URL(repository);
                host = url.host;
                repository = url.pathname
                    .replace(/^\//, '')
                    .replace(/\.git$/i, '');
            } catch {
                return null;
            }
        } else if (/^git@[^:]+:/i.test(repository)) {
            const separator = repository.indexOf(':');
            host = repository.slice(4, separator);
            repository = repository.slice(separator + 1);
        }
        const parts = repository.split('/');
        if (parts.length < 2 || parts.some((part) => !part.trim())) return null;
        const separator = repository.lastIndexOf('/');
        if (separator < 1) return null;
        owner = repository.slice(0, separator);
        name = repository.slice(separator + 1);
        if (provider !== DbtProjectType.GITLAB && owner.includes('/'))
            return null;
    }
    const normalize = (value: string) => value.trim().toLowerCase();
    host = normalize(host).replace(/\.$/, '');
    if (
        !host ||
        !owner.trim() ||
        !name.trim() ||
        /[\s/@?#]/.test(host) ||
        /[:@?#]/.test(owner) ||
        /[/:@?#]/.test(name)
    )
        return null;
    return {
        provider,
        host,
        owner: normalize(owner),
        name: normalize(name),
        defaultBranch: connection.branch,
    };
};
