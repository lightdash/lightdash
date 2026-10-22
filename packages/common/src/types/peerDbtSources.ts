import { type ProjectDbtSourceSummary } from './projects';

export type PeerMembershipRole = 'publish' | 'dependency_only';
export type PeerRefreshPolicy = 'git_refresh' | 'ci_managed';

export type DbtRepositorySummary = {
    dbtRepositoryUuid: string;
    provider: string;
    host: string;
    owner: string;
    name: string;
    defaultBranch: string | null;
    dbtProjectName: string | null;
    createdByProjectUuid: string | null;
    isShared: boolean;
};

export type PeerDbtSourceSettings = {
    usesSharedCredentials: boolean;
    dbtRepositoryUuid: string | null;
    dbtProjectName: string | null;
    warehouseConnectionUuid: string | null;
    membershipRole: PeerMembershipRole;
    refreshPolicy: PeerRefreshPolicy;
    dbtProjectNameConflict: string | null;
    dbtProjectNameState: 'unknown' | 'known' | 'conflict';
    repository: DbtRepositorySummary | null;
};

export type PeerDbtSourceSummary = ProjectDbtSourceSummary & {
    peer: PeerDbtSourceSettings;
};

export type UpdatePeerDbtSource = {
    dbtProjectName?: string | null;
    membershipRole?: PeerMembershipRole;
    refreshPolicy?: PeerRefreshPolicy;
};

export type AddSharedDbtSource = {
    dbtRepositoryUuid: string;
    name: string;
    warehouseConnectionUuid: string | null;
    membershipRole: PeerMembershipRole;
    refreshPolicy: PeerRefreshPolicy;
};

export const normalizeDbtProjectName = (name: string): string =>
    name.trim().toLowerCase();

export const validateDbtProjectName = (name: string): string | null =>
    /^[a-zA-Z_][a-zA-Z0-9_]{0,254}$/.test(name.trim())
        ? null
        : 'Use a dbt project name with letters, numbers, and underscores, starting with a letter or underscore';
