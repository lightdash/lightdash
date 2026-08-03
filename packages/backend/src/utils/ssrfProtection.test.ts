import { lookup } from 'node:dns/promises';
import { validatePublicHttpUrl } from './ssrfProtection';

vi.mock('node:dns/promises', () => ({
    lookup: vi.fn(),
}));

const mockedLookup = lookup as unknown as import('vitest').MockedFunction<
    () => Promise<{ address: string; family: number }[]>
>;

const privateUrlError =
    'MCP servers must use a public URL. Localhost and private network addresses are not supported.';

describe('validatePublicHttpUrl', () => {
    it('rejects invalid URLs with a human-readable message', async () => {
        await expect(validatePublicHttpUrl('not-a-url')).rejects.toThrow(
            'Enter a valid MCP server URL, including http:// or https://.',
        );
    });

    it('rejects unsupported protocols with a human-readable message', async () => {
        await expect(
            validatePublicHttpUrl('ftp://example.com/mcp'),
        ).rejects.toThrow(
            'MCP server URLs must start with http:// or https://.',
        );
    });

    it('rejects URL credentials with a human-readable message', async () => {
        await expect(
            validatePublicHttpUrl('https://user:pass@example.com/mcp'),
        ).rejects.toThrow(
            'Remove the username or password from the MCP server URL. Use the auth settings instead.',
        );
    });

    it('rejects localhost targets', async () => {
        await expect(
            validatePublicHttpUrl('http://localhost:3000/mcp', {
                allowedProtocols: ['http:', 'https:'],
            }),
        ).rejects.toThrow(privateUrlError);
    });

    it('rejects private IP targets', async () => {
        await expect(
            validatePublicHttpUrl('http://127.0.0.1:3000/mcp', {
                allowedProtocols: ['http:', 'https:'],
            }),
        ).rejects.toThrow(privateUrlError);
    });

    it('accepts private IP targets when explicitly allowed', async () => {
        await expect(
            validatePublicHttpUrl('http://127.0.0.1:3000/mcp', {
                allowedProtocols: ['http:', 'https:'],
                allowPrivateAddresses: true,
            }),
        ).resolves.toMatchObject({
            hostname: '127.0.0.1',
            protocol: 'http:',
        });
    });

    it('rejects IPv4-mapped IPv6 private targets', async () => {
        await expect(
            validatePublicHttpUrl('http://[::ffff:127.0.0.1]:3000/mcp', {
                allowedProtocols: ['http:', 'https:'],
            }),
        ).rejects.toThrow(privateUrlError);
    });

    it.each([
        'http://198.18.0.1',
        'http://[64:ff9b:1::7f00:1]',
        'http://[100:0:0:1::1]',
        'http://[2001:2::1]',
        'http://[400::1]',
        'http://[2001:5::1]',
        'http://[3fff::1]',
    ])('rejects non-public unicast target %s', async (url) => {
        await expect(
            validatePublicHttpUrl(url, {
                allowedProtocols: ['http:', 'https:'],
            }),
        ).rejects.toThrow(privateUrlError);
    });

    it('rejects public hostnames that resolve to private addresses', async () => {
        mockedLookup.mockResolvedValueOnce([
            { address: '10.0.0.10', family: 4 },
        ]);

        await expect(
            validatePublicHttpUrl('https://mcp.example.com/mcp'),
        ).rejects.toThrow(privateUrlError);
    });

    it('rejects unresolved hostnames with a human-readable message', async () => {
        mockedLookup.mockRejectedValueOnce(new Error('ENOTFOUND'));

        await expect(
            validatePublicHttpUrl('https://missing.example.com/mcp'),
        ).rejects.toThrow(
            "We couldn't find a server at that URL. Check the hostname and try again.",
        );
    });

    it('accepts public http urls when all resolved addresses are public', async () => {
        mockedLookup.mockResolvedValueOnce([
            { address: '93.184.216.34', family: 4 },
        ]);

        await expect(
            validatePublicHttpUrl('https://example.com/mcp'),
        ).resolves.toMatchObject({
            hostname: 'example.com',
            protocol: 'https:',
        });
    });

    it('accepts public IPv6 literals in global unicast space', async () => {
        mockedLookup.mockResolvedValueOnce([
            { address: '2606:4700:4700::1111', family: 6 },
        ]);

        await expect(
            validatePublicHttpUrl('https://[2606:4700:4700::1111]/mcp'),
        ).resolves.toMatchObject({
            hostname: '[2606:4700:4700::1111]',
            protocol: 'https:',
        });
        expect(mockedLookup).toHaveBeenCalledWith('2606:4700:4700::1111', {
            all: true,
        });
    });
});
