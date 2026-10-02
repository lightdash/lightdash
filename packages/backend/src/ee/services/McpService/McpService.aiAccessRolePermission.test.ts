import { FeatureFlags, QueryRefusalReason } from '@lightdash/common';
import { McpService } from './McpService';

const refusal =
    'Your role does not include AI access for this project. Ask an admin to add the "Use AI access" permission.';

const extra = {
    authInfo: {
        extra: {
            user: { userUuid: 'user-uuid', organizationUuid: 'org-uuid' },
            account: {
                user: { id: 'user-uuid' },
                authentication: { type: 'pat' },
            },
        },
    },
};

type PrivateService = {
    wrapToolCallback: (
        name: string,
        handler: (args: unknown, extra: unknown) => Promise<unknown>,
    ) => (args: unknown, extra: unknown) => Promise<unknown>;
};

const buildService = (enabled: boolean, allowed: boolean) => {
    const get = vi.fn().mockResolvedValue({ enabled });
    const can = vi.fn().mockReturnValue(allowed);
    const recordQueryRefusal = vi.fn().mockResolvedValue(undefined);
    const recordToolCall = vi.fn();
    const service = Object.assign(Object.create(McpService.prototype), {
        featureFlagService: { get },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
            }),
        },
        createAuditedAbility: () => ({ can }),
        asyncQueryService: { recordQueryRefusal },
        recordToolCall,
    }) as McpService;
    return {
        service: service as unknown as PrivateService,
        get,
        can,
        recordQueryRefusal,
        recordToolCall,
    };
};

describe('MCP AI access role permission', () => {
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
            const handler = vi
                .fn()
                .mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
            const tool = service.wrapToolCallback('run_metric_query', handler);
            const result = await tool({ projectUuid: 'project-uuid' }, extra);

            expect(get).toHaveBeenCalledWith({
                user: extra.authInfo.extra.user,
                featureFlagId: FeatureFlags.AiAccessRolePermission,
            });
            expect(result).toEqual(
                refused
                    ? {
                          content: [{ type: 'text', text: refusal }],
                          isError: true,
                      }
                    : { content: [{ type: 'text', text: 'ok' }] },
            );
            expect(handler).toHaveBeenCalledTimes(refused ? 0 : 1);
            expect(can).toHaveBeenCalledTimes(enabled ? 1 : 0);
            expect(recordQueryRefusal).toHaveBeenCalledTimes(refused ? 1 : 0);
            if (refused) {
                expect(recordQueryRefusal).toHaveBeenCalledWith(
                    expect.objectContaining({
                        reason: QueryRefusalReason.AI_ACCESS_OFF,
                    }),
                );
            }
        },
    );
});
