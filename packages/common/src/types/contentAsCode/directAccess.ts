import type { SpaceMemberRole } from '../space';

export type ContentAsCodeDirectAccessUser = {
    /** Primary email of a human organization member. */
    email: string;
    role: SpaceMemberRole;
};

export type ContentAsCodeDirectAccessGroup = {
    /** Exact, case-sensitive organization group name. */
    name: string;
    role: SpaceMemberRole;
};

/**
 * Portable direct user/group grants on a single resource. Mirrors the space
 * access block: principals are identified by organization email or group name,
 * never by internal identifiers. Inherited and effective roles are never part
 * of this shape — it reflects stored direct policy only.
 *
 * On upload: omission leaves the resource's existing direct policy unchanged;
 * a present block (including empty `users` and `groups`) atomically replaces
 * the whole policy.
 */
export type ContentAsCodeDirectAccess = {
    users: ContentAsCodeDirectAccessUser[];
    groups: ContentAsCodeDirectAccessGroup[];
};
