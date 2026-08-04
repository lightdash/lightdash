import {
    ForbiddenError,
    type Account,
    type AiDeepResearchRequestBody,
    type AiDeepResearchRun,
} from '@lightdash/common';
import type { Request } from 'express';
import {
    fromApiKey,
    fromOauth,
    fromServiceAccount,
    fromSession,
} from '../../auth/account/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
import type { ServiceRepository } from '../../services/ServiceRepository';
import type { AiDeepResearchService } from '../services/AiDeepResearchService/AiDeepResearchService';
import { AiDeepResearchController } from './AiDeepResearchController';

const projectUuid = 'project-uuid';
const requestBody: AiDeepResearchRequestBody = {
    prompt: 'Investigate conversion performance',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    promptUuid: 'prompt-uuid',
    entryPoint: 'ask_ai',
};
const run = {
    aiDeepResearchRunUuid: 'run-uuid',
} as AiDeepResearchRun;

const buildController = () => {
    const createRun = vi.fn<AiDeepResearchService['createRun']>(
        async () => run,
    );
    const services = {
        getAiDeepResearchService: () => ({ createRun }),
    } as unknown as ServiceRepository;

    return {
        controller: new AiDeepResearchController(services),
        createRun,
    };
};

const buildRequest = (account: Account): Request => ({ account }) as Request;

describe('AiDeepResearchController.createRun', () => {
    it.each([
        ['session', fromSession(defaultSessionUser, 'session-cookie')],
        ['personal access token', fromApiKey(defaultSessionUser, 'pat-token')],
        [
            'service account',
            fromServiceAccount(
                {
                    ...defaultSessionUser,
                    serviceAccount: {
                        uuid: 'service-account-uuid',
                        description: 'Service account',
                    },
                },
                'service-account-token',
            ),
        ],
        [
            'OAuth',
            fromOauth(defaultSessionUser, {
                accessToken: 'oauth-token',
                client: { id: 'oauth-client' },
            }),
        ],
    ])('allows %s authentication', async (_name, account) => {
        const { controller, createRun } = buildController();

        const response = await controller.createRun(
            buildRequest(account),
            projectUuid,
            requestBody,
        );

        expect(controller.getStatus()).toBe(202);
        expect(createRun).toHaveBeenCalledWith({
            user: expect.objectContaining({
                userUuid: defaultSessionUser.userUuid,
                organizationUuid: defaultSessionUser.organizationUuid,
            }),
            projectUuid,
            prompt: requestBody.prompt,
            agentUuid: requestBody.agentUuid,
            aiThreadUuid: requestBody.threadUuid,
            promptUuid: requestBody.promptUuid,
            entryPoint: requestBody.entryPoint,
        });
        expect(response).toEqual({ status: 'ok', results: run });
    });

    it('rejects embedded JWT authentication', async () => {
        const { controller, createRun } = buildController();

        await expect(
            controller.createRun(
                buildRequest(buildAccount({ accountType: 'jwt' })),
                projectUuid,
                requestBody,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(createRun).not.toHaveBeenCalled();
    });
});
