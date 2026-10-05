import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    ProjectType,
    type PossibleAbilities,
    type ProjectSummary,
} from '@lightdash/common';
import { fromSession } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import { type AwsWebIdentityAudienceModel } from '../models/AwsWebIdentityAudienceModel';
import { type FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import { type AwsWebIdentityResolver } from '../utils/awsWebIdentity/AwsWebIdentityResolver';
import { AwsWebIdentityService } from './AwsWebIdentityService';

const organizationUuid = defaultSessionUser.organizationUuid!;
const projectUuid = '11111111-1111-4111-8111-111111111111';

const buildAccount = (
    rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0],
) =>
    fromSession(
        {
            ...defaultSessionUser,
            ability: new Ability<PossibleAbilities>(rules),
        },
        'session-cookie',
    );

const account = buildAccount([
    { subject: 'Project', action: 'create', conditions: { organizationUuid } },
]);
const projectEditor = buildAccount([
    { subject: 'Project', action: 'update', conditions: { projectUuid } },
]);
const viewer = buildAccount([{ subject: 'Project', action: 'view' }]);

const project = {
    projectUuid,
    organizationUuid,
    type: ProjectType.DEFAULT,
    upstreamProjectUuid: null,
    createdByUserUuid: null,
} as unknown as ProjectSummary;

const buildService = (enabled: boolean, summary = project) => {
    const create = vi.fn(async () => 'lightdash-generated');
    const service = new AwsWebIdentityService({
        featureFlagModel: {
            get: async () => ({
                id: FeatureFlags.AthenaWebIdentityAuth,
                enabled,
            }),
        } as unknown as FeatureFlagModel,
        awsWebIdentityAudienceModel: {
            create,
        } as unknown as AwsWebIdentityAudienceModel,
        awsWebIdentityResolver: {
            getSubject: async () => '111429504119237381932',
        } as unknown as AwsWebIdentityResolver,
        projectModel: {
            getSummary: async () => summary,
        } as unknown as ProjectModel,
    });
    return { service, create };
};

describe('AwsWebIdentityService.getIdentity', () => {
    test("returns this instance's subject", async () => {
        await expect(
            buildService(true).service.getIdentity(account),
        ).resolves.toEqual({ subject: '111429504119237381932' });
    });

    test('refuses when the instance has not enabled it', async () => {
        await expect(
            buildService(false).service.getIdentity(account),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('AwsWebIdentityService.createAudience', () => {
    test("generates an audience for the user's organization", async () => {
        const { service, create } = buildService(true);

        await expect(
            service.createAudience(account, { projectUuid: null }),
        ).resolves.toEqual({
            audience: 'lightdash-generated',
            subject: '111429504119237381932',
        });
        expect(create).toHaveBeenCalledWith(
            organizationUuid,
            defaultSessionUser.userUuid,
        );
    });

    test('allows a user who can edit the project', async () => {
        const { service, create } = buildService(true);

        await service.createAudience(projectEditor, { projectUuid });
        expect(create).toHaveBeenCalled();
    });

    test("refuses a user who can't create a project", async () => {
        const { service, create } = buildService(true);

        await expect(
            service.createAudience(viewer, { projectUuid: null }),
        ).rejects.toThrow(ForbiddenError);
        expect(create).not.toHaveBeenCalled();
    });

    test("refuses a user who can't edit the project", async () => {
        const { service, create } = buildService(true);

        await expect(
            service.createAudience(viewer, { projectUuid }),
        ).rejects.toThrow(ForbiddenError);
        expect(create).not.toHaveBeenCalled();
    });

    test('refuses a project in another organization', async () => {
        const { service, create } = buildService(true, {
            ...project,
            organizationUuid: 'other-org-uuid',
        });

        await expect(
            service.createAudience(projectEditor, { projectUuid }),
        ).rejects.toThrow(ForbiddenError);
        expect(create).not.toHaveBeenCalled();
    });

    test('refuses when the instance has not enabled it', async () => {
        const { service, create } = buildService(false);

        await expect(
            service.createAudience(account, { projectUuid: null }),
        ).rejects.toThrow(ForbiddenError);
        expect(create).not.toHaveBeenCalled();
    });
});
