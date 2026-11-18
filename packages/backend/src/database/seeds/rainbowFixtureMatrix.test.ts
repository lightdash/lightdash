import {
    generateSlug,
    LightdashMode,
    SEED_EMBED_SECRET,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_VIEWER,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_ORG_2,
    SEED_ORG_2_ADMIN,
    SEED_ORG_2_ADMIN_EMAIL,
} from '@lightdash/common';
import {
    canUseKnownEmbedSecret,
    EMBED_FIXTURE_DASHBOARD_SLUG,
    getSeedEmbedSecret,
    RAINBOW_DEVELOPER,
    RAINBOW_JOIN_MEMBER,
    RAINBOW_PRIVATE_SPACE,
    RAINBOW_SECOND_ORG,
    RAINBOW_SECOND_ORG_ADMIN,
    RAINBOW_SECOND_PROJECT,
} from './rainbowFixtureMatrix';

describe('seed embed secret', () => {
    it('never uses the published secret in pull request mode', () => {
        expect(canUseKnownEmbedSecret(LightdashMode.PR, false)).toBe(false);
        expect(canUseKnownEmbedSecret(LightdashMode.PR, true)).toBe(false);
        const secret = getSeedEmbedSecret(LightdashMode.PR, true);
        expect(secret).not.toBe(SEED_EMBED_SECRET);
        expect(secret).toHaveLength(32);
    });

    it('never uses the published secret when the pull request flag is set', () => {
        expect(canUseKnownEmbedSecret(LightdashMode.DEV, true)).toBe(false);
        expect(canUseKnownEmbedSecret(LightdashMode.DEFAULT, true)).toBe(
            false,
        );
        expect(getSeedEmbedSecret(LightdashMode.DEV, true)).not.toBe(
            SEED_EMBED_SECRET,
        );
    });

    it('never uses the published secret in hosted modes', () => {
        expect(canUseKnownEmbedSecret(LightdashMode.DEMO, false)).toBe(false);
        expect(canUseKnownEmbedSecret(LightdashMode.CLOUD_BETA, false)).toBe(
            false,
        );
    });

    it('generates a different secret on each preview seed', () => {
        expect(getSeedEmbedSecret(LightdashMode.PR, true)).not.toBe(
            getSeedEmbedSecret(LightdashMode.PR, true),
        );
    });

    it('keeps the published secret for local development', () => {
        expect(canUseKnownEmbedSecret(LightdashMode.DEV, false)).toBe(true);
        expect(canUseKnownEmbedSecret(LightdashMode.DEFAULT, false)).toBe(
            true,
        );
        expect(getSeedEmbedSecret(LightdashMode.DEV, false)).toBe(
            SEED_EMBED_SECRET,
        );
    });
});

describe('rainbow fixture identities', () => {
    it('targets the Jaffle dashboard the saved dashboards seed creates', () => {
        expect(EMBED_FIXTURE_DASHBOARD_SLUG).toBe(
            generateSlug('Jaffle dashboard'),
        );
    });

    it('keeps the second shop out of the baseline organizations', () => {
        expect([
            SEED_ORG_1.organization_uuid,
            SEED_ORG_2.organization_uuid,
        ]).not.toContain(RAINBOW_SECOND_ORG.organization_uuid);
    });

    it('uses user ids and emails no baseline seed user has', () => {
        const baselineUuids = [
            SEED_ORG_1_ADMIN.user_uuid,
            SEED_ORG_1_EDITOR.user_uuid,
            SEED_ORG_1_VIEWER.user_uuid,
            SEED_ORG_2_ADMIN.user_uuid,
        ];
        const baselineEmails = [
            SEED_ORG_1_ADMIN_EMAIL.email,
            SEED_ORG_1_EDITOR_EMAIL.email,
            SEED_ORG_1_VIEWER_EMAIL.email,
            SEED_ORG_2_ADMIN_EMAIL.email,
        ];
        const fixtureUuids = [
            RAINBOW_DEVELOPER.user.user_uuid,
            RAINBOW_SECOND_ORG_ADMIN.user.user_uuid,
        ];
        const fixtureEmails = [
            RAINBOW_DEVELOPER.email,
            RAINBOW_SECOND_ORG_ADMIN.email,
            RAINBOW_JOIN_MEMBER.email,
        ];
        fixtureUuids.forEach((uuid) =>
            expect(baselineUuids).not.toContain(uuid),
        );
        fixtureEmails.forEach((email) =>
            expect(baselineEmails).not.toContain(email),
        );
        expect(new Set(fixtureUuids).size).toBe(fixtureUuids.length);
        expect(new Set(fixtureEmails).size).toBe(fixtureEmails.length);
    });

    it('stores fixture emails in the lowercase form logins compare', () => {
        [
            RAINBOW_DEVELOPER.email,
            RAINBOW_SECOND_ORG_ADMIN.email,
            RAINBOW_JOIN_MEMBER.email,
        ].forEach((email) => expect(email).toBe(email.toLowerCase()));
    });

    it('puts the joinable member on the allowed domain', () => {
        expect(RAINBOW_JOIN_MEMBER.email.split('@')[1]).toBe(
            RAINBOW_JOIN_MEMBER.domain,
        );
    });

    it('looks up the second shop by the slug its name produces', () => {
        expect(RAINBOW_SECOND_PROJECT.slug).toBe(
            generateSlug(RAINBOW_SECOND_PROJECT.name),
        );
        expect(RAINBOW_SECOND_PROJECT.sharedSpaceSlug).toBe(
            generateSlug('Shared'),
        );
    });

    it('names the private space apart from the space suite text', () => {
        [RAINBOW_PRIVATE_SPACE.name, RAINBOW_PRIVATE_SPACE.dashboardName].forEach(
            (name) => expect(name.toLowerCase()).not.toContain('private space'),
        );
    });
});
