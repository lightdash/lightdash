import {
    LightdashMode,
    OrganizationMemberRole,
    SEED_EMBED_SECRET,
    SEED_ORG_1_EDITOR,
} from '@lightdash/common';
import { nanoid } from 'nanoid';

export const RAINBOW_DEVELOPER = {
    user: {
        ...SEED_ORG_1_EDITOR,
        user_uuid: 'e8394ede-3daf-45bb-a7d6-59705612fa41',
        first_name: 'Rainbow',
        last_name: 'Developer',
    },
    email: 'rainbow-developer@example.test',
    role: OrganizationMemberRole.DEVELOPER,
} as const;

export const RAINBOW_SECOND_ORG = {
    organization_uuid: 'b3f1c7a2-5d4e-4f8a-9c6b-2e7d1a0f3b58',
    organization_name: 'Rainbow Second Shop',
};

export const RAINBOW_SECOND_ORG_ADMIN = {
    user: {
        ...SEED_ORG_1_EDITOR,
        user_uuid: 'c4a2d8b3-6e5f-4a9b-8d7c-3f8e2b1a4c69',
        first_name: 'Rainbow',
        last_name: 'Second Admin',
    },
    email: 'rainbow-second-admin@example.test',
    role: OrganizationMemberRole.ADMIN,
} as const;

export const RAINBOW_SECOND_PROJECT = {
    name: 'Rainbow second shop',
    slug: 'rainbow-second-shop',
    sharedSpaceSlug: 'shared',
    dashboardName: 'Rainbow second shop dashboard',
    originalConnectionName: 'Rainbow second shop original',
    alternateConnectionName: 'Rainbow alternate',
};

export const RAINBOW_PRIVATE_SPACE = {
    name: 'Rainbow private',
    dashboardName: 'Rainbow private dashboard',
};

export const RAINBOW_JOIN_MEMBER = {
    domain: 'join.rainbow.example.test',
    email: 'rainbow-member@join.rainbow.example.test',
    role: OrganizationMemberRole.VIEWER,
} as const;

export const EMBED_FIXTURE_DASHBOARD_SLUG = 'jaffle-dashboard';

export const canUseKnownEmbedSecret = (
    mode: LightdashMode,
    isPullRequest: boolean,
): boolean =>
    (mode === LightdashMode.DEV || mode === LightdashMode.DEFAULT) &&
    !isPullRequest;

export const getSeedEmbedSecret = (
    mode: LightdashMode,
    isPullRequest: boolean,
): string =>
    canUseKnownEmbedSecret(mode, isPullRequest)
        ? SEED_EMBED_SECRET
        : nanoid(32);
