import {
    Account,
    ContentType,
    CreateEmbedJwt,
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
    timezone: null,
    isSetupComplete: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ability: {
        can: jest.fn(),
        cannot: jest.fn(),
    } as unknown as MemberAbility,
    abilityRules: [],
});

const buildJwtAccount = ({
    content = {
        type: 'apiAccess',
        projectUuid: 'project-uuid',
        serviceAccountUserUuid: 'embed-write-user-uuid',
    } satisfies CreateEmbedJwt['content'],
}: {
    content?: CreateEmbedJwt['content'];
}): Account =>
    ({
        isJwtUser: () => true,
        authentication: {
            type: 'jwt',
            data: {
                content,
            },
        },
        embedWriteUser: buildSessionUser(),
    }) as unknown as Account;

const buildController = () => {
    const find = jest.fn().mockResolvedValue({ data: [] });
    const controller = new ContentController({
        getContentService: () => ({ find }),
    } as unknown as ConstructorParameters<typeof ContentController>[0]);
    controller.setStatus = jest.fn();

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
    });
});
