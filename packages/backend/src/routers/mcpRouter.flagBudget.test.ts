import { FeatureFlags } from '@lightdash/common';
import type { Request, Response } from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { EventEmitter } from 'node:events';
import { fromApiKey } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { McpService } from '../ee/services/McpService/McpService';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { featureFlagRequestMiddleware } from '../models/FeatureFlagModel/requestFeatureFlags';
import { FeatureFlagService } from '../services/FeatureFlag/FeatureFlagService';
import mcpRouter from './mcpRouter';

const transport = vi.hoisted(() => ({ handleRequest: vi.fn() }));
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
    StreamableHTTPServerTransport: class {
        handleRequest = transport.handleRequest;
    },
}));

test('a flag-off MCP tools/list request resolves agent identity once', async () => {
    const database = knex({ client: MockClient });
    const tracker = getTracker();
    tracker.on.select('feature_flags').response(({ bindings }) =>
        bindings.includes(FeatureFlags.AgentIdentity)
            ? [
                  {
                      flag_id: FeatureFlags.AgentIdentity,
                      default_enabled: false,
                  },
              ]
            : [],
    );
    tracker.on.select('feature_flag_overrides').response([]);
    const lightdashConfig = {
        ...lightdashConfigMock,
        mcp: { ...lightdashConfigMock.mcp, enabled: true },
        previewFeatureFlags: { enabled: false },
        enabledFeatureFlags: new Set<string>(),
        disabledFeatureFlags: new Set<string>(),
    };
    const featureFlagModel = new FeatureFlagModel({
        database,
        lightdashConfig,
    });
    const get = vi.spyOn(featureFlagModel, 'get');
    const user = {
        ...defaultSessionUser,
        userUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const createServer = vi.fn().mockResolvedValue({ connect: vi.fn() });
    const service = Object.assign(Object.create(McpService.prototype), {
        lightdashConfig,
        logger: { debug: vi.fn() },
        featureFlagService: new FeatureFlagService({
            featureFlagModel,
            lightdashConfig,
        }),
        aiOrganizationSettingsService: {
            isMcpEnabled: vi.fn().mockResolvedValue(true),
            isMcpContentWritesEnabled: vi.fn().mockResolvedValue(false),
        },
        aiAgentToolsService: {
            canGenerateDataApp: vi.fn().mockResolvedValue(false),
            canAuthorCustomChartTypes: vi.fn().mockResolvedValue(false),
            canUseCustomChartTypes: vi.fn().mockResolvedValue(false),
        },
        createServer,
        recordDisabledToolRefusal: vi.fn(),
        recordToolList: vi.fn(),
    }) as McpService;
    const request = {
        method: 'POST',
        headers: {},
        params: {},
        user,
        account: fromApiKey(user, 'test-key'),
        services: { getMcpService: () => service },
        body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    };
    const response = Object.assign(new EventEmitter(), {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    });
    const routeHandler = mcpRouter.stack[0].route.stack.at(-1).handle;
    try {
        await new Promise<void>((resolve, reject) => {
            featureFlagRequestMiddleware(
                request as unknown as Request,
                response as unknown as Response,
                () => {
                    void routeHandler(
                        request as unknown as Request,
                        response as unknown as Response,
                    ).then(resolve, reject);
                },
            );
        });
        expect(response.status).not.toHaveBeenCalled();
        expect(transport.handleRequest).toHaveBeenCalledOnce();
        expect(createServer).toHaveBeenCalledWith(
            expect.objectContaining({
                featureAvailability: expect.objectContaining({
                    agentIdentityEnabled: false,
                }),
            }),
        );
        expect(
            get.mock.calls.filter(
                ([args]) => args.featureFlagId === FeatureFlags.AgentIdentity,
            ),
        ).toHaveLength(1);
        expect(
            tracker.history.select.filter(({ bindings }) =>
                bindings.includes(FeatureFlags.AgentIdentity),
            ),
        ).toHaveLength(3);
    } finally {
        response.emit('finish');
        tracker.reset();
        await database.destroy();
    }
});
