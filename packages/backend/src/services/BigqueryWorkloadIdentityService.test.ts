import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    ProjectType,
    type PossibleAbilities,
    type ProjectSummary,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { fromSession } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { BigqueryWorkloadIdentityResolver } from '../utils/googleIdentity/BigqueryWorkloadIdentityResolver';
import { tokenFor } from '../utils/googleIdentity/googleIdentityTokenSource.mock';
import { BigqueryWorkloadIdentityService } from './BigqueryWorkloadIdentityService';

const organizationUuid = '00000000-0000-4000-8000-00000000000a';
const otherOrganizationUuid = '00000000-0000-4000-8000-00000000000b';
const projectUuid = '11111111-1111-4111-8111-111111111111';
const googleSubject = '111429504119237381932';
const identity = {
    issuer: 'https://accounts.google.com',
    subject: googleSubject,
};
const token = tokenFor({ sub: googleSubject });

const buildSessionAccount = (
    rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0],
    org = organizationUuid,
) =>
    fromSession(
        {
            ...defaultSessionUser,
            organizationUuid: org,
            ability: new Ability<PossibleAbilities>(rules),
        },
        'session-cookie',
    );

const creator = buildSessionAccount([
    { subject: 'Project', action: 'create', conditions: { organizationUuid } },
]);
const projectEditor = buildSessionAccount([
    { subject: 'Project', action: 'update', conditions: { projectUuid } },
]);
const viewer = buildSessionAccount([{ subject: 'Project', action: 'view' }]);

const project: ProjectSummary = {
    name: 'Analytics',
    slug: 'analytics',
    projectUuid,
    organizationUuid,
    type: ProjectType.DEFAULT,
    upstreamProjectUuid: undefined,
    createdByUserUuid: null,
};

const build = (enabled = true) => {
    const get = vi.fn<FeatureFlagModel['get']>().mockResolvedValue({
        id: FeatureFlags.BigqueryWorkloadIdentityAuth,
        enabled,
    });
    const getSummary = vi.fn(async () => project);
    const getIdToken = vi.fn(async () => token);
    const bigqueryWorkloadIdentityResolver =
        new BigqueryWorkloadIdentityResolver({
            isEnabledFor: async () => enabled,
            tokenSource: { getIdToken },
        });
    const dependencies = {
        featureFlagModel: { get },
        projectModel: { getSummary },
        bigqueryWorkloadIdentityResolver,
    };
    return {
        service: new BigqueryWorkloadIdentityService(dependencies),
        dependencies,
        get,
        getSummary,
        getIdToken,
    };
};

describe('BigqueryWorkloadIdentityService.getIdentity', () => {
    test('returns only the issuer and subject and resolves the flag for the organization', async () => {
        const { service, get, getIdToken, getSummary } = build();

        await expect(service.getIdentity(creator)).resolves.toEqual(identity);
        expect(get).toHaveBeenCalledExactlyOnceWith({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.BigqueryWorkloadIdentityAuth,
        });
        expect(getIdToken).toHaveBeenCalledExactlyOnceWith(
            'lightdash-subject-lookup',
        );
        expect(getSummary).not.toHaveBeenCalled();
    });

    test('checks project permissions before returning a typed disabled-flag error', async () => {
        const { service, get, getIdToken, getSummary } = build(false);
        const result = service.getIdentity(projectEditor, projectUuid);

        await expect(result).rejects.toThrow(FeatureNotEnabledError);
        await expect(result).rejects.toMatchObject({
            statusCode: 403,
            data: {
                code: 'feature_not_enabled',
                featureFlagId: FeatureFlags.BigqueryWorkloadIdentityAuth,
            },
        });
        expect(getSummary).toHaveBeenCalledExactlyOnceWith(projectUuid);
        expect(getSummary.mock.invocationCallOrder[0]).toBeLessThan(
            get.mock.invocationCallOrder[0],
        );
        expect(getIdToken).not.toHaveBeenCalled();
    });

    test.each([true, false])(
        'refuses unauthorized callers before resolving the flag (enabled: %s)',
        async (enabled) => {
            const { service, get, getIdToken } = build(enabled);

            await expect(
                service.getIdentity(viewer, projectUuid),
            ).rejects.toMatchObject({
                name: 'ForbiddenError',
            });
            expect(get).not.toHaveBeenCalled();
            expect(getIdToken).not.toHaveBeenCalled();
        },
    );

    test('returns null when metadata is unavailable and retries the next request', async () => {
        const { service, getIdToken } = build();
        getIdToken.mockRejectedValueOnce(new Error('metadata unavailable'));

        await expect(service.getIdentity(creator)).resolves.toEqual({
            ...identity,
            subject: null,
        });
        await expect(service.getIdentity(creator)).resolves.toEqual(identity);
        await expect(service.getIdentity(creator)).resolves.toEqual(identity);
        expect(getIdToken).toHaveBeenCalledTimes(2);
    });

    test('returns null when the metadata token has no subject', async () => {
        const { service, getIdToken } = build();
        getIdToken.mockResolvedValueOnce('invalid-token');

        await expect(service.getIdentity(creator)).resolves.toEqual({
            ...identity,
            subject: null,
        });
    });

    test('refuses an account without an organization', async () => {
        const { service, get, getIdToken } = build();
        const account = fromSession(
            { ...defaultSessionUser, organizationUuid: undefined },
            'session-cookie',
        );

        await expect(service.getIdentity(account)).rejects.toThrow(
            ForbiddenError,
        );
        expect(get).not.toHaveBeenCalled();
        expect(getIdToken).not.toHaveBeenCalled();
    });
});

describe('organization flag resolution', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    beforeEach(() => tracker.reset());
    afterAll(async () => database.destroy());

    test('honors Console enable, disable and re-enable with a cached subject and no ENV enablement', async () => {
        let enabled = false;
        tracker.on.select('feature_flags').response([
            {
                feature_flag_uuid: 'flag-uuid',
                flag_id: FeatureFlags.BigqueryWorkloadIdentityAuth,
                default_enabled: false,
            },
        ]);
        tracker.on
            .select('feature_flag_overrides')
            .response((query) =>
                query.bindings.includes(organizationUuid) ? [{ enabled }] : [],
            );
        const { dependencies, getIdToken } = build();
        const service = new BigqueryWorkloadIdentityService({
            ...dependencies,
            featureFlagModel: new FeatureFlagModel({
                database,
                lightdashConfig: {
                    ...lightdashConfigMock,
                    enabledFeatureFlags: new Set(),
                    disabledFeatureFlags: new Set(),
                    previewFeatureFlags: { enabled: false },
                },
            }),
        });
        const otherCreator = buildSessionAccount(
            [
                {
                    subject: 'Project',
                    action: 'create',
                    conditions: { organizationUuid: otherOrganizationUuid },
                },
            ],
            otherOrganizationUuid,
        );

        await expect(service.getIdentity(creator)).rejects.toThrow(
            FeatureNotEnabledError,
        );
        expect(getIdToken).not.toHaveBeenCalled();
        enabled = true;
        await expect(service.getIdentity(creator)).resolves.toEqual(identity);
        await expect(service.getIdentity(otherCreator)).rejects.toThrow(
            FeatureNotEnabledError,
        );
        await expect(service.getIdentity(viewer)).rejects.toThrow(
            ForbiddenError,
        );
        enabled = false;
        await expect(service.getIdentity(creator)).rejects.toThrow(
            FeatureNotEnabledError,
        );
        enabled = true;
        await expect(service.getIdentity(creator)).resolves.toEqual(identity);
        expect(getIdToken).toHaveBeenCalledOnce();
    });
});
