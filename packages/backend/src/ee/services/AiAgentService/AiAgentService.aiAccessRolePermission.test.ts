import {
    FeatureFlags,
    ForbiddenError,
    QueryRefusalReason,
    QuerySurface,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { AiAgentService } from './AiAgentService';

const refusal =
    'Your role does not include AI access for this project. Ask an admin to add the "Use AI access" permission.';

type PrivateService = {
    assertPromptAiAccess: (
        user: typeof defaultSessionUser,
        organizationUuid: string,
        projectUuid: string,
        surface: QuerySurface.AI_AGENT | QuerySurface.SLACK_AGENT,
    ) => Promise<void>;
};

const buildService = (enabled: boolean, allowed: boolean) => {
    const get = vi.fn().mockResolvedValue({ enabled });
    const can = vi.fn().mockReturnValue(allowed);
    const recordQueryRefusal = vi.fn().mockResolvedValue(undefined);
    const service = Object.assign(Object.create(AiAgentService.prototype), {
        featureFlagService: { get },
        createAuditedAbility: () => ({ can }),
        asyncQueryService: { recordQueryRefusal },
    }) as AiAgentService;
    return {
        service: service as unknown as PrivateService,
        get,
        can,
        recordQueryRefusal,
    };
};

describe('AI agent role permission', () => {
    it('returns the refusal text from an in-app stream', async () => {
        const { service } = buildService(true, false);
        Object.assign(service, {
            beginStreamPreparation: vi.fn(),
            endStreamPreparation: vi.fn(),
            prepareAgentThreadResponse: vi
                .fn()
                .mockRejectedValue(new ForbiddenError(refusal)),
        });

        await expect(
            (service as unknown as AiAgentService).streamAgentThreadResponse(
                defaultSessionUser,
                {
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                    toolHints: [],
                },
            ),
        ).rejects.toThrow(refusal);
    });

    it('replies in the Slack thread when AI access is denied', async () => {
        const { service, recordQueryRefusal } = buildService(true, false);
        const postMessage = vi.fn().mockResolvedValue({ ok: true });
        Object.assign(service, {
            aiAgentModel: {
                findSlackPrompt: vi.fn().mockResolvedValue({
                    promptUuid: 'prompt-uuid',
                    createdByUserUuid: defaultSessionUser.userUuid,
                    organizationUuid: defaultSessionUser.organizationUuid,
                    projectUuid: 'project-uuid',
                    slackChannelId: 'channel-id',
                    slackThreadTs: 'thread-ts',
                    promptSlackTs: 'prompt-ts',
                }),
            },
            userModel: {
                findSessionUserAndOrgByUuid: vi
                    .fn()
                    .mockResolvedValue(defaultSessionUser),
            },
            slackClient: { postMessage },
        });

        await (service as unknown as AiAgentService).replyToSlackPrompt(
            'prompt-uuid',
        );

        expect(postMessage).toHaveBeenCalledExactlyOnceWith({
            organizationUuid: defaultSessionUser.organizationUuid,
            channel: 'channel-id',
            thread_ts: 'thread-ts',
            text: refusal,
        });
        expect(recordQueryRefusal).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                reason: QueryRefusalReason.AI_ACCESS_OFF,
                aiSurface: QuerySurface.SLACK_AGENT,
            }),
        );
    });

    it.each([
        { enabled: true, allowed: false, refused: true },
        { enabled: true, allowed: true, refused: false },
        { enabled: false, allowed: false, refused: false },
    ])(
        'enforces flag=$enabled permission=$allowed',
        async ({ enabled, allowed, refused }) => {
            const { service, get, can, recordQueryRefusal } = buildService(
                enabled,
                allowed,
            );
            const result = service.assertPromptAiAccess(
                defaultSessionUser,
                defaultSessionUser.organizationUuid!,
                'project-uuid',
                QuerySurface.AI_AGENT,
            );

            if (refused) {
                await expect(result).rejects.toThrow(refusal);
            } else {
                await expect(result).resolves.toBeUndefined();
            }
            expect(get).toHaveBeenCalledWith({
                user: defaultSessionUser,
                featureFlagId: FeatureFlags.AiAccessRolePermission,
            });
            expect(can).toHaveBeenCalledTimes(enabled ? 1 : 0);
            expect(recordQueryRefusal).toHaveBeenCalledTimes(refused ? 1 : 0);
            if (refused) {
                expect(recordQueryRefusal).toHaveBeenCalledWith(
                    expect.objectContaining({
                        reason: QueryRefusalReason.AI_ACCESS_OFF,
                        aiSurface: QuerySurface.AI_AGENT,
                    }),
                );
            }
        },
    );
});
