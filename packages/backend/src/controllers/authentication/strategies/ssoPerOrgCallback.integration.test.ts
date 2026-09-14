import {
    OpenIdIdentityIssuerType,
    OrganizationSsoProvider,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_2,
} from '@lightdash/common';
import { Request } from 'express';
import { Profile as PassportProfile } from 'passport';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { OrganizationDomainVerificationsTableName } from '../../../database/entities/organizationDomainVerifications';
import {
    getTestContext,
    IntegrationTestContext,
} from '../../../vitest.setup.integration';
import { genericOidcHandler, PerOrgSsoContext } from './oidcStrategy';

// The org whose per-org SSO strategy authenticates the request ("attacker" org
// in the finding's terms) and an unrelated org that owns a different domain.
const ATTACKER_ORG = SEED_ORG_1.organization_uuid;
const OTHER_ORG = SEED_ORG_2.organization_uuid;
const ATTACKER_DOMAIN = 'attacker-corp.example';
const OTHER_DOMAIN = 'other-corp.example';
const ATTACKER_IDP_ISSUER = 'https://idp.attacker-corp.example';

const attackerPerOrg: PerOrgSsoContext = {
    organizationUuid: ATTACKER_ORG,
    provider: OrganizationSsoProvider.GENERIC_OIDC,
};

const verifiedProfile = (email: string, subject: string): PassportProfile =>
    ({
        id: subject,
        emails: [{ value: email }],
        _json: { email_verified: true },
    }) as unknown as PassportProfile;

type HandlerOutcome = {
    err: unknown;
    user: Express.User | false | null | undefined;
    info: { message?: string } | undefined;
};

let context: IntegrationTestContext;

const runCallback = (
    profile: PassportProfile,
    perOrgSso: PerOrgSsoContext | undefined,
): Promise<HandlerOutcome> =>
    new Promise((resolve) => {
        const req = {
            session: { oauth: {} },
            user: undefined,
            services: context.app.getServiceRepository(),
            ip: '127.0.0.1',
            get: () => 'integration-test',
        } as unknown as Request;
        const handler = genericOidcHandler(
            OpenIdIdentityIssuerType.GENERIC_OIDC,
            ATTACKER_IDP_ISSUER,
            perOrgSso,
        );
        handler(req, ATTACKER_IDP_ISSUER, profile, (err, user, info) =>
            resolve({ err, user, info } as HandlerOutcome),
        );
    });

// Emails provisioned by the "allowed" cases — cleaned up so re-runs stay green.
const provisionedEmails = new Set<string>();

const deleteUserByEmail = async (email: string) => {
    const user = await context.app
        .getModels()
        .getUserModel()
        .findUserByEmail(email);
    if (user) {
        await context.db('users').where('user_uuid', user.userUuid).delete();
    }
};

describe('per-org SSO callback — email-domain re-check (integration)', () => {
    beforeAll(async () => {
        context = getTestContext();

        // Self-clean any test users left by a prior run (e.g. a red-on-old run
        // where the guard was disabled and provisioned the out-of-scope user),
        // so the suite is idempotent regardless of prior DB state.
        await Promise.all(
            [
                `newcomer@${OTHER_DOMAIN}`,
                `employee@${ATTACKER_DOMAIN}`,
                `env-user@${OTHER_DOMAIN}`,
            ].map((email) => deleteUserByEmail(email)),
        );

        await context
            .db(OrganizationDomainVerificationsTableName)
            .insert([
                {
                    organization_uuid: ATTACKER_ORG,
                    domain: ATTACKER_DOMAIN,
                    verified_at: new Date(),
                },
                {
                    organization_uuid: OTHER_ORG,
                    domain: OTHER_DOMAIN,
                    verified_at: new Date(),
                },
            ])
            .onConflict(['organization_uuid', 'domain'])
            .merge({ verified_at: new Date() });

        // Attacker org's enabled generic-OIDC method routes ALL of its verified
        // domains (override=false), i.e. attacker-corp.example — and nothing of
        // other-corp.example, which is verified for a different org.
        await context.app
            .getModels()
            .getOrganizationSsoModel()
            .upsert(
                ATTACKER_ORG,
                OrganizationSsoProvider.GENERIC_OIDC,
                {
                    clientId: 'attacker-client',
                    clientSecret: 'attacker-secret',
                    metadataDocumentEndpoint: `${ATTACKER_IDP_ISSUER}/.well-known/openid-configuration`,
                    scopes: null,
                },
                {
                    enabled: true,
                    overrideEmailDomains: false,
                    emailDomains: [],
                    allowPassword: true,
                },
                SEED_ORG_1_ADMIN.user_uuid,
            );
    });

    afterAll(async () => {
        await Promise.all([...provisionedEmails].map(deleteUserByEmail));
        await context
            .db('organization_sso_configurations')
            .where('organization_uuid', ATTACKER_ORG)
            .where('provider', OrganizationSsoProvider.GENERIC_OIDC)
            .delete();
        await context
            .db(OrganizationDomainVerificationsTableName)
            .whereIn('domain', [ATTACKER_DOMAIN, OTHER_DOMAIN])
            .delete();
    });

    test('routing rule: the attacker org method routes its own domain but not another org domain', async () => {
        const ssoService = context.app
            .getServiceRepository()
            .getOrganizationSsoService();

        await expect(
            ssoService.isEmailDomainAllowedForOrgSso(
                `person@${ATTACKER_DOMAIN}`,
                ATTACKER_ORG,
                OrganizationSsoProvider.GENERIC_OIDC,
            ),
        ).resolves.toBe(true);

        await expect(
            ssoService.isEmailDomainAllowedForOrgSso(
                `person@${OTHER_DOMAIN}`,
                ATTACKER_ORG,
                OrganizationSsoProvider.GENERIC_OIDC,
            ),
        ).resolves.toBe(false);
    });

    test('callback REJECTS an IdP identity whose email domain is outside the authorizing org whitelist (no user provisioned)', async () => {
        const outOfScopeEmail = `newcomer@${OTHER_DOMAIN}`;

        const { err, user, info } = await runCallback(
            verifiedProfile(outOfScopeEmail, 'attacker-supplied-subject-1'),
            attackerPerOrg,
        );

        expect(err).toBeNull();
        // Rejected: passport receives `false`, not a session user.
        expect(user).toBeFalsy();
        expect(info?.message).toBeTruthy();

        // The real login path never ran, so no cross-domain user was created.
        const provisioned = await context.app
            .getModels()
            .getUserModel()
            .findUserByEmail(outOfScopeEmail);
        expect(provisioned).toBeUndefined();
    });

    test('callback ALLOWS an IdP identity whose email domain is inside the authorizing org whitelist', async () => {
        const inScopeEmail = `employee@${ATTACKER_DOMAIN}`;
        provisionedEmails.add(inScopeEmail);

        const { err, user } = await runCallback(
            verifiedProfile(inScopeEmail, 'attacker-own-subject-1'),
            attackerPerOrg,
        );

        expect(err).toBeNull();
        // Allowed: the real login path ran and returned a session user.
        expect(user).toBeTruthy();
        expect((user as { email?: string }).email).toBe(inScopeEmail);
    });

    test('env-based single-tenant callback (no per-org context) still logs in regardless of domain', async () => {
        const envEmail = `env-user@${OTHER_DOMAIN}`;
        provisionedEmails.add(envEmail);

        const { err, user } = await runCallback(
            verifiedProfile(envEmail, 'env-subject-1'),
            undefined,
        );

        expect(err).toBeNull();
        expect(user).toBeTruthy();
    });
});
