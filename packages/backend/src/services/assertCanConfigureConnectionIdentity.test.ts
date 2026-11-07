import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    ProjectType,
    type PossibleAbilities,
    type ProjectSummary,
} from '@lightdash/common';
import { fromSession } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import {
    CaslAuditWrapper,
    type AuditLogger,
} from '../logging/caslAuditWrapper';
import { assertCanConfigureConnectionIdentity } from './assertCanConfigureConnectionIdentity';

const organizationUuid = '00000000-0000-4000-8000-00000000000a';
const otherOrganizationUuid = '00000000-0000-4000-8000-00000000000b';
const projectUuid = '11111111-1111-4111-8111-111111111111';
const project: ProjectSummary = {
    name: 'Analytics',
    projectUuid,
    organizationUuid,
    type: ProjectType.DEFAULT,
    upstreamProjectUuid: undefined,
    createdByUserUuid: null,
};

const build = (
    rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0],
) => {
    const account = fromSession(
        {
            ...defaultSessionUser,
            organizationUuid,
            ability: new Ability<PossibleAbilities>(rules),
        },
        'session-cookie',
    );
    const auditLogger = vi.fn<AuditLogger>();
    const ability = new CaslAuditWrapper(account.user.ability, account, {
        auditLogger,
        auditEnabled: true,
    });
    const getSummary = vi.fn(async () => project);
    const check = (requestedProjectUuid?: string) =>
        assertCanConfigureConnectionIdentity({
            ability,
            organizationUuid,
            projectModel: { getSummary },
            projectUuid: requestedProjectUuid,
        });
    return { check, getSummary, auditLogger };
};

describe('assertCanConfigureConnectionIdentity', () => {
    test.each([ProjectType.DEFAULT, ProjectType.PREVIEW])(
        'allows creation permission for a %s project',
        async (type) => {
            const { check, getSummary } = build([
                {
                    subject: 'Project',
                    action: 'create',
                    conditions: { organizationUuid, type },
                },
            ]);

            await expect(check()).resolves.toBeUndefined();
            expect(getSummary).not.toHaveBeenCalled();
        },
    );

    test('refuses training-only creation permission', async () => {
        const { check } = build([
            {
                subject: 'Project',
                action: 'create',
                conditions: { organizationUuid, type: ProjectType.TRAINING },
            },
        ]);

        await expect(check()).rejects.toThrow(ForbiddenError);
    });

    test('allows a user who can edit the requested project', async () => {
        const { check, getSummary } = build([
            {
                subject: 'Project',
                action: 'update',
                conditions: { projectUuid },
            },
        ]);

        await expect(check(projectUuid)).resolves.toBeUndefined();
        expect(getSummary).toHaveBeenCalledExactlyOnceWith(projectUuid);
    });

    test.each([undefined, projectUuid])(
        'refuses a viewer for project %s',
        async (requestedProjectUuid) => {
            const { check } = build([{ subject: 'Project', action: 'view' }]);

            await expect(check(requestedProjectUuid)).rejects.toThrow(
                ForbiddenError,
            );
        },
    );

    test('refuses project creation permission scoped to another organization', async () => {
        const { check } = build([
            {
                subject: 'Project',
                action: 'create',
                conditions: { organizationUuid: otherOrganizationUuid },
            },
        ]);

        await expect(check()).rejects.toThrow(ForbiddenError);
    });

    test('checks the audited ability before refusing a project in another organization', async () => {
        const { check, getSummary, auditLogger } = build([
            {
                subject: 'Project',
                action: 'update',
                conditions: { organizationUuid },
            },
        ]);
        getSummary.mockResolvedValue({
            ...project,
            organizationUuid: otherOrganizationUuid,
        });

        await expect(check(projectUuid)).rejects.toThrow(ForbiddenError);
        expect(auditLogger).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'update',
                status: 'denied',
                actor: expect.objectContaining({
                    uuid: defaultSessionUser.userUuid,
                }),
                resource: expect.objectContaining({
                    type: 'Project',
                    organizationUuid: otherOrganizationUuid,
                    projectUuid,
                }),
            }),
        );
    });

    test('refuses another organization even when the audited ability grants the update', async () => {
        const { check, getSummary, auditLogger } = build([
            {
                subject: 'Project',
                action: 'update',
                conditions: { projectUuid },
            },
        ]);
        getSummary.mockResolvedValue({
            ...project,
            organizationUuid: otherOrganizationUuid,
        });

        await expect(check(projectUuid)).rejects.toThrow(ForbiddenError);
        expect(auditLogger).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'update',
                status: 'allowed',
            }),
        );
    });

    test('checks the resolved project type when authorizing updates', async () => {
        const { check, getSummary } = build([
            {
                subject: 'Project',
                action: 'update',
                conditions: { organizationUuid, type: ProjectType.PREVIEW },
            },
        ]);

        await expect(check(projectUuid)).rejects.toThrow(ForbiddenError);
        getSummary.mockResolvedValue({ ...project, type: ProjectType.PREVIEW });
        await expect(check(projectUuid)).resolves.toBeUndefined();
    });
});
