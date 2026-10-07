import {
    Account,
    ContentType,
    CreateEmbedJwt,
    ForbiddenError,
    MemberAbility,
    OrganizationMemberRole,
    SessionUser,
} from '@lightdash/common';
import express from 'express';
import { ContentController } from './ContentController';

const buildSessionUser = (): SessionUser => ({
    userUuid: 'embed-write-user-uuid',
    userId: 1,
    role: OrganizationMemberRole.DEVELOPER,
    email: 'embedded@example.com',
    firstName: 'Embedded',
    lastName: 'User',
    organizationUuid: 'organization-uuid',
    organizationName: 'Organization',
    organizationCreatedAt: new Date('2024-01-01'),
    isActive: true,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ability: {
        can: vi.fn(),
        cannot: vi.fn(),
    } as unknown as MemberAbility,
    abilityRules: [],
});

const buildJwtAccount = ({
    content = {
        type: 'apiAccess',
        projectUuid: 'project-uuid',
        serviceAccountUserUuid: 'embed-write-user-uuid',
    } satisfies CreateEmbedJwt['content'],
    writeActions,
}: {
    content?: CreateEmbedJwt['content'];
    writeActions?: CreateEmbedJwt['writeActions'];
}): Account =>
    ({
        isJwtUser: () => true,
        authentication: {
            type: 'jwt',
            data: {
                content,
                writeActions,
            },
        },
        embedWriteUser: buildSessionUser(),
    }) as unknown as Account;

const buildController = () => {
    const find = vi.fn().mockResolvedValue({ data: [] });
    const controller = new ContentController({
        getContentService: () => ({ find }),
    } as unknown as ConstructorParameters<typeof ContentController>[0]);
    controller.setStatus = vi.fn();

    return { controller, find };
};

describe('ContentController', () => {
    describe('listContent', () => {
        it('uses the apiAccess service account actor and keeps requested spaces for JWT accounts', async () => {
            const { controller, find } = buildController();
            const req = {
                account: buildJwtAccount({}),
            } as express.Request;

            await controller.listContent(
                req,
                ['project-uuid'],
                ['requested-space-uuid'],
                undefined,
                undefined,
                [ContentType.CHART],
                50,
                1,
                undefined,
                undefined,
                undefined,
            );

            expect(find).toHaveBeenCalledWith(
                expect.objectContaining({
                    userUuid: 'embed-write-user-uuid',
                }),
                expect.objectContaining({
                    projectUuids: ['project-uuid'],
                    spaceUuids: ['requested-space-uuid'],
                    contentTypes: [ContentType.CHART],
                }),
                expect.any(Object),
                expect.objectContaining({
                    page: 1,
                    pageSize: 50,
                }),
            );
        });

        describe('with source spaces on the token', () => {
            const buildScopedRequest = () =>
                ({
                    account: buildJwtAccount({
                        content: {
                            type: 'dashboard',
                            dashboardUuid: 'dashboard-uuid',
                        },
                        writeActions: {
                            spaceUuid: 'write-space-uuid',
                            serviceAccountUserUuid: 'embed-write-user-uuid',
                            sourceSpaceUuids: ['source-space-uuid'],
                        },
                    }),
                }) as express.Request;

            it('defaults the listing to the write and source spaces', async () => {
                const { controller, find } = buildController();

                await controller.listContent(
                    buildScopedRequest(),
                    ['project-uuid'],
                    undefined,
                    undefined,
                    undefined,
                    [ContentType.CHART],
                );

                expect(find).toHaveBeenCalledWith(
                    expect.any(Object),
                    expect.objectContaining({
                        spaceUuids: ['write-space-uuid', 'source-space-uuid'],
                    }),
                    expect.any(Object),
                    expect.any(Object),
                );
            });

            it('keeps a requested subset of the token spaces', async () => {
                const { controller, find } = buildController();

                await controller.listContent(
                    buildScopedRequest(),
                    ['project-uuid'],
                    ['source-space-uuid'],
                );

                expect(find).toHaveBeenCalledWith(
                    expect.any(Object),
                    expect.objectContaining({
                        spaceUuids: ['source-space-uuid'],
                    }),
                    expect.any(Object),
                    expect.any(Object),
                );
            });

            it('rejects spaces outside the token scope', async () => {
                const { controller, find } = buildController();

                await expect(
                    controller.listContent(
                        buildScopedRequest(),
                        ['project-uuid'],
                        ['source-space-uuid', 'other-space-uuid'],
                    ),
                ).rejects.toThrowError(ForbiddenError);
                expect(find).not.toHaveBeenCalled();
            });

            it.each<
                [string, { sharedWithMe?: boolean; dataAppVizsFilter?: 'only' }]
            >([
                ['shared with me', { sharedWithMe: true }],
                ['data app vizs', { dataAppVizsFilter: 'only' }],
            ])(
                'rejects %s listings that bypass space scoping',
                async (_label, { sharedWithMe, dataAppVizsFilter }) => {
                    const { controller, find } = buildController();

                    await expect(
                        controller.listContent(
                            buildScopedRequest(),
                            ['project-uuid'],
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            dataAppVizsFilter,
                            undefined,
                            sharedWithMe,
                        ),
                    ).rejects.toThrowError(ForbiddenError);
                    expect(find).not.toHaveBeenCalled();
                },
            );
        });
    });
});
