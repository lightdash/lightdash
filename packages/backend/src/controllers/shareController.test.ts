import {
    ForbiddenError,
    type AnonymousAccount,
    type SessionUser,
} from '@lightdash/common';
import type express from 'express';
import type { ServiceRepository } from '../services/ServiceRepository';
import {
    FullShareUrl,
    SampleShareUrl,
    User,
} from '../services/ShareService/ShareService.mock';
import { ShareController } from './shareController';

const createShareUrl = jest.fn(async () => FullShareUrl);

const buildController = () =>
    new ShareController({
        getShareService: () => ({
            createShareUrl,
        }),
    } as unknown as ServiceRepository);

const buildRequest = (account: express.Request['account']) =>
    ({ account }) as express.Request;

const buildJwtAccount = ({
    embedWriteContext,
    embedWriteUser,
    writeActions,
}: {
    embedWriteContext?: AnonymousAccount['embedWriteContext'];
    embedWriteUser?: SessionUser;
    writeActions?: AnonymousAccount['authentication']['data']['writeActions'];
}) =>
    ({
        isJwtUser: () => true,
        authentication: {
            type: 'jwt',
            data: {
                writeActions,
            },
        },
        embedWriteContext,
        embedWriteUser,
    }) as AnonymousAccount;

describe('ShareController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('creates share URLs for AI agent embed write actors', async () => {
            const controller = buildController();
            const account = buildJwtAccount({
                embedWriteUser: User,
                embedWriteContext: {
                    canCreateSavedChart: true,
                    canUseAiAgent: true,
                },
                writeActions: {
                    spaceUuid: 'space-uuid',
                    serviceAccountUserUuid: User.userUuid,
                },
            });

            await expect(
                controller.create(
                    {
                        path: SampleShareUrl.path,
                        params: SampleShareUrl.params,
                    },
                    buildRequest(account),
                ),
            ).resolves.toEqual({
                status: 'ok',
                results: FullShareUrl,
            });

            expect(createShareUrl).toHaveBeenCalledWith(
                User,
                SampleShareUrl.path,
                SampleShareUrl.params,
            );
        });

        it('rejects embed JWTs that cannot use the AI agent', async () => {
            const controller = buildController();
            const account = buildJwtAccount({
                embedWriteUser: User,
                embedWriteContext: {
                    canCreateSavedChart: true,
                    canUseAiAgent: false,
                    aiAgentErrorMessage: 'AI agent is not available',
                },
                writeActions: {
                    spaceUuid: 'space-uuid',
                    serviceAccountUserUuid: User.userUuid,
                },
            });

            await expect(
                controller.create(
                    {
                        path: SampleShareUrl.path,
                        params: SampleShareUrl.params,
                    },
                    buildRequest(account),
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(createShareUrl).not.toHaveBeenCalled();
        });

        it('rejects embed JWTs without write actions', async () => {
            const controller = buildController();
            const account = buildJwtAccount({
                embedWriteContext: {
                    canCreateSavedChart: true,
                    canUseAiAgent: true,
                },
            });

            await expect(
                controller.create(
                    {
                        path: SampleShareUrl.path,
                        params: SampleShareUrl.params,
                    },
                    buildRequest(account),
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(createShareUrl).not.toHaveBeenCalled();
        });
    });
});
