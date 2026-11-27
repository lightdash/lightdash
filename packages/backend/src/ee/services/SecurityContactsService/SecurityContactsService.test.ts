import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ForbiddenError,
    LightdashMode,
    NotFoundError,
    ParameterError,
    UnexpectedServerError,
    type Account,
    type MemberAbility,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightdashConfig } from '../../../config/parseConfig';
import { SecurityContactsService } from './SecurityContactsService';

const sessionOrgUuid = 'session-org-uuid';

const buildAccount = (ability: MemberAbility): Account =>
    ({
        authentication: { type: 'session', source: 'session-cookie' },
        organization: {
            organizationUuid: sessionOrgUuid,
            name: 'Org',
            createdAt: new Date(),
        },
        user: {
            id: 'user-uuid',
            userUuid: 'user-uuid',
            role: 'member',
            isActive: true,
            type: 'registered',
            ability,
            abilityRules: ability.rules,
        },
        isAnonymousUser: () => false,
        isAuthenticated: () => true,
        isJwtUser: () => false,
        isOauthUser: () => false,
        isPatUser: () => false,
        isRegisteredUser: () => true,
        isServiceAccount: () => false,
        isSessionUser: () => true,
    }) as Account;

const ability = (organizationUuid?: string): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (organizationUuid) {
        builder.can('manage', 'Organization', { organizationUuid });
    }
    return builder.build();
};
const admin = buildAccount(ability(sessionOrgUuid));

describe('SecurityContactsService', () => {
    const fetchMock = vi.fn();
    const warn = vi.fn();

    const buildService = ({
        licenseKey = 'test-license-key',
        mode = LightdashMode.DEFAULT,
    }: { licenseKey?: string | null; mode?: LightdashMode } = {}) => {
        const service = new SecurityContactsService({
            lightdashConfig: {
                mode,
                license: { licenseKey },
                roadmap: { baseUrl: 'http://127.0.0.1:8081' },
            } as LightdashConfig,
        });
        Object.assign(service, {
            logger: { warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() },
        });
        return service;
    };

    const respond = (status: number, body: unknown = {}) =>
        fetchMock.mockImplementation(
            async () => new Response(JSON.stringify(body), { status }),
        );

    beforeEach(() => {
        respond(200, {
            status: 'ok',
            results: { emails: ['security@example.com'] },
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('reads and saves with the instance license and no organization identifier', async () => {
        const service = buildService();

        await expect(service.getContacts(admin)).resolves.toEqual({
            emails: ['security@example.com'],
        });
        await expect(
            service.updateContacts(admin, {
                emails: [' Security@Example.com '],
            }),
        ).resolves.toEqual({ emails: ['security@example.com'] });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [[getUrl, getInit], [putUrl, putInit]] = fetchMock.mock.calls;
        expect(getUrl).toBe('http://127.0.0.1:8081/api/v1/security/contacts');
        expect(putUrl).toBe(getUrl);
        expect(getInit.method).toBe('GET');
        expect(getInit.body).toBeUndefined();
        expect(putInit.method).toBe('PUT');
        expect(putInit.headers['lightdash-license-key']).toBe(
            'test-license-key',
        );
        expect(JSON.parse(putInit.body)).toEqual({
            emails: ['security@example.com'],
        });
        expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(
            sessionOrgUuid,
        );
    });

    it.each([
        ['a user who cannot manage the organization', {}, ability()],
        ['an admin of another organization', {}, ability('another-org-uuid')],
        ['a cloud instance', { mode: LightdashMode.CLOUD_BETA }, undefined],
        ['an instance without a license key', { licenseKey: null }, undefined],
    ])('denies %s without calling the service', async (_, options, own) => {
        const service = buildService(options);
        const account = own ? buildAccount(own) : admin;

        await expect(service.getContacts(account)).rejects.toThrow(
            ForbiddenError,
        );
        await expect(
            service.updateContacts(account, { emails: [] }),
        ).rejects.toThrow(ForbiddenError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        [{ emails: ['not-an-email'] }],
        [{ emails: Array.from({ length: 11 }, (_, i) => `u${i}@example.com`) }],
        [{}],
        [{ emails: [], organizationUuid: 'another-org-uuid' }],
    ])(
        'rejects an invalid update %j before calling the service',
        async (body) => {
            await expect(
                buildService().updateContacts(admin, body),
            ).rejects.toThrow(ParameterError);
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it.each([
        [401, ForbiddenError],
        [403, ForbiddenError],
        [404, NotFoundError],
        [400, ParameterError],
        [502, UnexpectedServerError],
    ])('maps upstream %i', async (status, expected) => {
        respond(status, { errors: [{ detail: 'private upstream detail' }] });
        const error = await buildService()
            .getContacts(admin)
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(expected);
        expect((error as Error).message).not.toContain('private');
        expect(JSON.stringify(warn.mock.calls)).not.toContain(
            'test-license-key',
        );
    });

    it('fails closed on an unreachable service or an invalid response', async () => {
        respond(200, { status: 'ok', results: { emails: 'nope' } });
        await expect(buildService().getContacts(admin)).rejects.toThrow(
            UnexpectedServerError,
        );
        fetchMock.mockRejectedValue(new Error('test-license-key leaked'));
        await expect(buildService().getContacts(admin)).rejects.toThrow(
            UnexpectedServerError,
        );
        expect(JSON.stringify(warn.mock.calls)).not.toContain(
            'test-license-key',
        );
    });
});
