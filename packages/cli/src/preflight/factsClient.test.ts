import fetch, { Response } from 'node-fetch';
import {
    executePreflightAction,
    loadFactsContents,
    type PreflightActionDependencies,
    type PreflightOptions,
} from './command';
import {
    fetchMigrationFacts,
    migrationFactsUrl,
    type MigrationFactsClientDependencies,
} from './factsClient';

const options: PreflightOptions = {
    to: '1.79.0',
    from: '1.78.0',
    facts: [],
    intervalSeconds: 10,
    json: false,
};

const makeClientDependencies = (
    request: typeof fetch,
    timeoutMs = 1000,
): MigrationFactsClientDependencies => ({
    fetch: request,
    timeoutMs,
});

const runFetchFailure = async (
    request: typeof fetch,
    timeoutMs = 1000,
): Promise<{
    exit: PreflightActionDependencies['exit'];
    stderr: PreflightActionDependencies['stderr'];
}> => {
    const exit = vi.fn<PreflightActionDependencies['exit']>();
    const stderr = vi.fn<PreflightActionDependencies['stderr']>();
    await executePreflightAction(options, {
        run: async () => {
            await fetchMigrationFacts(
                options.to,
                makeClientDependencies(request, timeoutMs),
            );
            return 0;
        },
        exit,
        stderr,
    });
    return { exit, stderr };
};

describe('migration facts release asset', () => {
    it('fetches the target release asset and returns validated JSON', async () => {
        const request = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(
                JSON.stringify({
                    schemaVersion: '1',
                    migrationFacts: [],
                }),
                { status: 200 },
            ),
        );

        const raw = await fetchMigrationFacts(
            options.to,
            makeClientDependencies(request),
        );

        expect(JSON.parse(raw)).toEqual({
            schemaVersion: '1',
            migrationFacts: [],
        });
        expect(request).toHaveBeenCalledWith(
            migrationFactsUrl(options.to),
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('reports a missing release asset and exits 3', async () => {
        const request = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('Not found', { status: 404 }));

        const result = await runFetchFailure(request);

        expect(result.stderr).toHaveBeenCalledWith(
            expect.stringContaining(
                `no release asset was found at ${migrationFactsUrl(options.to)} (HTTP 404)`,
            ),
        );
        expect(result.stderr).toHaveBeenCalledWith(
            expect.stringContaining('pass the file with --facts <path>'),
        );
        expect(result.exit).toHaveBeenCalledWith(3);
    });

    it('reports a non-JSON response and exits 3', async () => {
        const request = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('<html>proxy error</html>'));

        const result = await runFetchFailure(request);

        expect(result.stderr).toHaveBeenCalledWith(
            expect.stringContaining(
                `${migrationFactsUrl(options.to)} returned a non-JSON response`,
            ),
        );
        expect(result.stderr).toHaveBeenCalledWith(
            expect.stringContaining('pass the file with --facts <path>'),
        );
        expect(result.exit).toHaveBeenCalledWith(3);
    });

    it('reports a network failure and exits 3', async () => {
        const request = vi
            .fn<typeof fetch>()
            .mockRejectedValue(new Error('getaddrinfo ENOTFOUND github.com'));

        const result = await runFetchFailure(request);

        expect(result.stderr).toHaveBeenCalledWith(
            expect.stringContaining(
                `the request to ${migrationFactsUrl(options.to)} failed (getaddrinfo ENOTFOUND github.com)`,
            ),
        );
        expect(result.stderr).toHaveBeenCalledWith(
            expect.stringContaining('pass the file with --facts <path>'),
        );
        expect(result.exit).toHaveBeenCalledWith(3);
    });

    it('times out the release asset request and exits 3', async () => {
        const request = vi.fn<typeof fetch>().mockImplementation(
            (_url, init) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        const error = new Error('aborted');
                        error.name = 'AbortError';
                        reject(error);
                    });
                }),
        );

        const result = await runFetchFailure(request, 1);

        expect(result.stderr).toHaveBeenCalledWith(
            expect.stringContaining(
                `the request to ${migrationFactsUrl(options.to)} timed out after 1ms`,
            ),
        );
        expect(result.exit).toHaveBeenCalledWith(3);
    });

    it('uses every local --facts override without attempting a download', async () => {
        const fetchFacts = vi
            .fn<(version: string) => Promise<string>>()
            .mockRejectedValue(new Error('network should not be used'));
        const readFile = vi
            .fn<(path: string) => Promise<string>>()
            .mockResolvedValueOnce('{"release":"1.78.0"}')
            .mockResolvedValueOnce('{"release":"1.79.0"}');

        const contents = await loadFactsContents(
            {
                to: options.to,
                facts: ['first.json', 'second.json'],
            },
            { fetchFacts, readFile },
        );

        expect(contents).toEqual([
            '{"release":"1.78.0"}',
            '{"release":"1.79.0"}',
        ]);
        expect(readFile).toHaveBeenCalledTimes(2);
        expect(fetchFacts).not.toHaveBeenCalled();
    });
});
