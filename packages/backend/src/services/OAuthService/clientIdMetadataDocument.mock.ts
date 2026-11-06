// Client ID metadata documents as published by MCP clients, fetched 2026-11-06.
// Keep these verbatim: the parser must accept what the clients actually serve.
// Refresh with: curl -H 'Accept: application/json' <client_id>

type LiveClientMetadataDocument = {
    client_id: string;
    client_name: string;
    redirect_uris: string[];
    token_endpoint_auth_method: string;
    grant_types: string[];
};

// ChatGPT: https://chatgpt.com/oauth/client.json
export const chatGptClientMetadataDocument = {
    client_id: 'https://chatgpt.com/oauth/client.json',
    client_uri: 'https://chatgpt.com/',
    redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: 'ChatGPT',
    logo_uri: 'https://persistent.oaistatic.com/sonic/misc/openai-logo.png',
    token_endpoint_auth_signing_alg: 'RS256',
    jwks_uri: 'https://chatgpt.com/oauth/jwks.json',
};

// Claude Code: https://claude.ai/oauth/claude-code-client-metadata
export const claudeCodeClientMetadataDocument = {
    client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
    client_name: 'Claude Code',
    client_uri: 'https://claude.ai',
    redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
};

// Grok: https://grok.com/oauth/mcp-client.json
export const grokClientMetadataDocument = {
    client_id: 'https://grok.com/oauth/mcp-client.json',
    client_name: 'Grok',
    client_uri: 'https://grok.com',
    logo_uri: 'https://grok.com/icon-512x512.png',
    redirect_uris: [
        'https://grok.com/connectors-oauth-exchange-code/',
        'https://console.x.ai/connectors-oauth-exchange-code/',
    ],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
};

// Cursor: https://cursor.com/oauth/mcp-client.json
export const cursorClientMetadataDocument = {
    client_id: 'https://cursor.com/oauth/mcp-client.json',
    client_name: 'Cursor',
    client_uri: 'https://cursor.com',
    logo_uri:
        'https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/uploads/cursorlogomcpv3.svg',
    redirect_uris: [
        'https://www.cursor.com/agents/mcp/oauth/callback',
        'https://www.cursor.com/bot/mcp/oauth/callback',
        'https://grok.com/connectors-oauth-exchange-code/',
        'http://localhost:8787/callback',
        'http://127.0.0.1:8787/callback',
    ],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
};

// VS Code: https://vscode.dev/oauth/client-metadata.json
export const vsCodeClientMetadataDocument = {
    client_name: 'Visual Studio Code',
    logo_uri: 'https://code.visualstudio.com/assets/branding/code-stable.png',
    grant_types: [
        'authorization_code',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code',
    ],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'native',
    client_id: 'https://vscode.dev/oauth/client-metadata.json',
    client_uri: 'https://vscode.dev/product',
    redirect_uris: ['http://127.0.0.1:33418/', 'https://vscode.dev/redirect'],
};

export const liveClientMetadataDocuments: Array<
    [label: string, document: LiveClientMetadataDocument]
> = [
    ['ChatGPT', chatGptClientMetadataDocument],
    ['Claude Code', claudeCodeClientMetadataDocument],
    ['Grok', grokClientMetadataDocument],
    ['Cursor', cursorClientMetadataDocument],
    ['VS Code', vsCodeClientMetadataDocument],
];
