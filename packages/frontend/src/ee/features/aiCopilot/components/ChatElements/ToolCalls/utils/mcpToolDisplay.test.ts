import { describe, expect, it } from 'vitest';
import {
    getMcpProviderMetadata,
    getMcpServerDisplayName,
    getMcpServerForToolName,
    getMcpToolParts,
    getMcpToolDisplayMetadata,
    sanitizeMcpToolKeyPart,
} from './mcpToolDisplay';

describe('mcpToolDisplay', () => {
    it('extracts the MCP server and tool key from namespaced tool names', () => {
        expect(getMcpToolParts('mcp_github__create_issue')).toEqual({
            serverKey: 'github',
            toolKey: 'create_issue',
        });
    });

    it('falls back to a readable server display name', () => {
        expect(getMcpProviderMetadata('mcp_github__search_repos')).toEqual({
            kind: 'generic',
            label: 'Github',
            shortLabel: 'G',
        });

        expect(getMcpServerDisplayName('mcp_internal_tools__lookup')).toBe(
            'Internal tools',
        );
    });

    it('uses the same server name sanitization as backend MCP tool names', () => {
        expect(sanitizeMcpToolKeyPart('Acme Docs MCP')).toBe('acme_docs_mcp');
    });

    it('matches tool calls to attached MCP servers and uses the stored icon URL', () => {
        const mcpServer = {
            uuid: 'server-1',
            projectUuid: 'project-1',
            name: 'Acme Docs MCP',
            url: 'https://docs.example.com/mcp',
            iconUrl: 'https://docs.example.com/icon.svg',
            authType: 'oauth',
            hasCredentials: true,
            credentialScope: 'shared',
            connectionStatus: 'connected',
            error: null,
            connectedByUserUuid: 'user-1',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
        } as const;

        expect(
            getMcpServerForToolName('mcp_acme_docs_mcp__search', [mcpServer]),
        ).toBe(mcpServer);

        expect(
            getMcpToolDisplayMetadata('mcp_acme_docs_mcp__search', mcpServer),
        ).toMatchObject({
            kind: 'generic',
            label: 'Acme Docs MCP',
            iconUrl: 'https://docs.example.com/icon.svg',
        });
    });
});
