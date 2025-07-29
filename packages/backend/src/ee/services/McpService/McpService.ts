import {
    ForbiddenError,
    MissingConfigError,
    OauthAccount,
    SessionUser,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import { OAuthScope } from '../../../services/OAuthService/OAuthService';
import { VERSION } from '../../../version';

export enum McpToolName {
    GET_LIGHTDASH_VERSION = 'get_lightdash_version',
}

type McpServiceArguments = {
    lightdashConfig: LightdashConfig;
};

export type ExtraContext = { user: SessionUser; account: OauthAccount };
type McpContext = {
    authInfo?: AuthInfo & {
        extra: ExtraContext;
    };
};

export class McpService extends BaseService {
    private lightdashConfig: LightdashConfig;

    private mcpServer: McpServer;

    constructor({ lightdashConfig }: McpServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        try {
            this.mcpServer = new McpServer({
                name: 'Lightdash MCP Server',
                version: VERSION,
            });
            this.setupHandlers();
        } catch (error) {
            this.logger.error('Error initializing MCP server:', error);
            throw error;
        }
    }

    private setupHandlers(): void {
        this.mcpServer.registerTool(
            McpToolName.GET_LIGHTDASH_VERSION,
            {
                description: 'Get the current Lightdash version',
                inputSchema: {},
            },
            async (args, context) => ({
                content: [
                    {
                        type: 'text',
                        text: this.getLightdashVersion(context as McpContext),
                    },
                ],
            }),
        );
    }

    public getServer(): McpServer {
        return this.mcpServer;
    }

    public canAccessMcp(context: McpContext): boolean {
        if (!context.authInfo) {
            throw new ForbiddenError('Invalid authInfo context');
        }

        const user = context.authInfo.extra?.user;
        const account = context.authInfo.extra?.account;
        const { scopes } = account.authentication;

        // TODO replace with CASL ability check
        if (
            !scopes.includes(OAuthScope.MCP_READ) &&
            !scopes.includes(OAuthScope.MCP_WRITE)
        ) {
            throw new ForbiddenError('You are not allowed to access MCP');
        }

        if (!this.lightdashConfig.mcp.enabled) {
            throw new MissingConfigError('MCP is not enabled');
        }

        return true;
    }

    public getLightdashVersion(context: McpContext): string {
        this.canAccessMcp(context);
        return VERSION;
    }
}
