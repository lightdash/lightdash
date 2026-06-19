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
    spaceUuid,
}: {
    spaceUuid: string;
}): Account =>
    ({
        isJwtUser: () => true,
        authentication: {
            type: 'jwt',
            data: {
                writeActions: {
                    spaceUuid,
                    userUuid: 'embed-write-user-uuid',
                } satisfies CreateEmbedJwt['writeActions'],
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
        it('uses the embed write-action space instead of requested spaces for JWT accounts', async () => {
            const { controller, find } = buildController();
            const req = {
                account: buildJwtAccount({ spaceUuid: 'token-space-uuid' }),
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
                    spaceUuids: ['token-space-uuid'],
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
