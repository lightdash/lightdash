import { type Request, type Response } from 'express';
import { defaultSessionUser } from '../auth/account/account.mock';
import { handleAgentApprovalAuthorize } from './agentConnectionApprovalAuthorize';

it.each([
    {
        query: { agent_request: '00000000-0000-4000-8000-000000000099' },
        body: {},
    },
    {
        query: {},
        body: { agent_request: '00000000-0000-4000-8000-000000000099' },
    },
    {
        query: { agent_request: ['first', 'second'] },
        body: { agent_request: 'third' },
    },
])(
    'leaves all request fields unchanged with the flag off: $query $body',
    async ({ query, body }) => {
        await Promise.all(
            [undefined, defaultSessionUser].map(async (user) => {
                const isEnabledForUser = vi.fn().mockResolvedValue(false);
                const assertReviewable = vi.fn();
                const req = Object.freeze({
                    query: Object.freeze({
                        ...query,
                        client_id: 'lightdash-cli',
                    }),
                    body: Object.freeze(body),
                    url: '/authorize?agent_request=00000000-0000-4000-8000-000000000099&client_id=lightdash-cli',
                    originalUrl:
                        '/api/v1/oauth/authorize?agent_request=00000000-0000-4000-8000-000000000099&client_id=lightdash-cli',
                    user,
                    services: {
                        getAgentConnectionApprovalService: () => ({
                            isEnabledForUser,
                            assertReviewable,
                        }),
                    },
                }) as unknown as Request;
                const res = {
                    set: vi.fn(),
                    status: vi.fn(),
                    redirect: vi.fn(),
                    json: vi.fn(),
                };
                await expect(
                    handleAgentApprovalAuthorize(
                        req,
                        res as unknown as Response,
                    ),
                ).resolves.toBe(false);
                expect(isEnabledForUser).toHaveBeenCalledExactlyOnceWith(user);
                expect(assertReviewable).not.toHaveBeenCalled();
                Object.values(res).forEach((method) =>
                    expect(method).not.toHaveBeenCalled(),
                );
            }),
        );
    },
);
