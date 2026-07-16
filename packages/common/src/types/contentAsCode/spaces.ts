import type { SpaceMemberRole } from '../space';
import type { ContentAsCodeType } from './core';

export type SpaceAsCodeUserAccess = {
    /** Primary email of a human organization member. */
    email: string;
    role: SpaceMemberRole;
};

export type SpaceAsCodeGroupAccess = {
    /** Exact, case-sensitive organization group name. */
    name: string;
    role: SpaceMemberRole;
};

export type SpaceAsCodeAccess = {
    inheritParentPermissions: boolean;
    projectMemberAccessRole: SpaceMemberRole | null;
    users: SpaceAsCodeUserAccess[];
    groups: SpaceAsCodeGroupAccess[];
};

export type SpaceAsCode = {
    contentType: ContentAsCodeType.SPACE;
    /** Optional only for backwards-compatible metadata-only files. */
    version?: 1;
    /** The original human-readable space name (preserves emoji, casing, etc.) */
    spaceName: string;
    /** Full portable hierarchy path used for identity and cross-referencing. */
    slug: string;
    /** Omission leaves the existing access policy unchanged. */
    access?: SpaceAsCodeAccess;
};

export type SpaceAsCodeSkip = {
    slug: string;
    reason: string;
};

export enum SpaceAsCodeAction {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    NO_CHANGES = 'NO_CHANGES',
}

export type ApiSpaceAsCodeListResponse = {
    status: 'ok';
    results: {
        spaces: SpaceAsCode[];
        skipped: SpaceAsCodeSkip[];
    };
};

export type ApiSpaceAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action: SpaceAsCodeAction;
        /** Destructive effects that could not be represented in the input file. */
        warnings?: string[];
    };
};
