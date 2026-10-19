import { GithubReleaseNotesClient } from './GithubReleaseNotesClient';

const mockFetch = vi.fn<typeof fetch>();
const release = (
    tag: string,
    body: string | null = '### Features\n* A feature',
) => ({
    tag_name: tag,
    body,
    draft: false,
    prerelease: false,
});
const respond = (body: unknown, status = 200) =>
    mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(body), { status }),
    );

beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => vi.unstubAllGlobals());

it('filters the range, v prefixes, drafts and prereleases and sorts newest first', async () => {
    respond([
        release('2.1.0', 'old'),
        release('v2.2.0', '### Features\n* New feature'),
        release('2.3.0', '## Features\n* Latest feature'),
        release('2.4.0', 'future'),
        release('2.2.0-beta', 'beta'),
        { ...release('2.2.1', 'draft'), draft: true },
        { ...release('2.2.2', 'prerelease'), prerelease: true },
    ]);
    expect(
        await new GithubReleaseNotesClient().getFeatureCandidates(
            '2.1.0',
            '2.3.0',
        ),
    ).toEqual({
        status: 'ready',
        candidates: [
            {
                id: '2.3.0-1',
                version: '2.3.0',
                scope: null,
                text: 'Latest feature',
                number: null,
                relatedNumbers: [],
                url: 'https://github.com/lightdash/lightdash/releases/tag/2.3.0',
            },
            {
                id: '2.2.0-1',
                version: '2.2.0',
                scope: null,
                text: 'New feature',
                number: null,
                relatedNumbers: [],
                url: 'https://github.com/lightdash/lightdash/releases/tag/2.2.0',
            },
        ],
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=1'),
        expect.objectContaining({
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Lightdash-release-notes',
            },
            signal: expect.any(AbortSignal),
        }),
    );
});

it('pages until the oldest tag reaches the running version', async () => {
    respond([release('2.3.0')]);
    respond([release('2.2.0'), release('2.0.0')]);
    const result = await new GithubReleaseNotesClient().getFeatureCandidates(
        '2.1.0',
        '2.3.0',
    );
    expect(result.status).toBe('ready');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain('page=2');
});

it('makes at most five release page requests', async () => {
    for (let page = 0; page < 5; page += 1) respond([release('2.3.0')]);
    await new GithubReleaseNotesClient().getFeatureCandidates('2.1.0', '2.3.0');
    expect(mockFetch).toHaveBeenCalledTimes(5);
});

it('uses first commit message lines when release bodies are absent', async () => {
    respond([release('2.2.0', null), release('2.1.0')]);
    respond({
        commits: [
            { commit: { message: 'feat: First change (#1)\nDetails' } },
            {
                commit: {
                    message: 'feat(charts): Latest change (#2)\nDetails',
                },
            },
        ],
    });
    expect(
        await new GithubReleaseNotesClient().getFeatureCandidates(
            '2.1.0',
            '2.2.0',
        ),
    ).toEqual({
        status: 'ready',
        candidates: [
            {
                id: 'pr-2',
                version: '2.2.0',
                scope: 'charts',
                text: 'Latest change',
                number: 2,
                relatedNumbers: [2],
                url: 'https://github.com/lightdash/lightdash/pull/2',
            },
            {
                id: 'pr-1',
                version: '2.2.0',
                scope: null,
                text: 'First change',
                number: 1,
                relatedNumbers: [1],
                url: 'https://github.com/lightdash/lightdash/pull/1',
            },
        ],
    });
    expect(mockFetch.mock.calls[1][0]).toContain('/compare/2.1.0...2.2.0');
});

it.each([403, 429, 500])('returns unavailable for HTTP %s', async (status) => {
    respond({}, status);
    expect(
        await new GithubReleaseNotesClient().getFeatureCandidates(
            '2.1.0',
            '2.2.0',
        ),
    ).toEqual({ status: 'unavailable' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
});

it.each(['TimeoutError', 'TypeError'])(
    'returns unavailable for %s',
    async (name) => {
        mockFetch.mockRejectedValueOnce(
            new DOMException('Request failed', name),
        );
        expect(
            await new GithubReleaseNotesClient().getFeatureCandidates(
                '2.1.0',
                '2.2.0',
            ),
        ).toEqual({ status: 'unavailable' });
    },
);

it('sets a five-second timeout on every request', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    respond([]);
    respond({ commits: [{ commit: { message: 'A change' } }] });
    await new GithubReleaseNotesClient().getFeatureCandidates('2.1.0', '2.2.0');
    expect(timeout).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenNthCalledWith(1, 5000);
    expect(timeout).toHaveBeenNthCalledWith(2, 5000);
    timeout.mockRestore();
});

it('returns no candidates for an empty source and unavailable for a malformed source', async () => {
    respond([]);
    respond({ commits: [] });
    expect(
        await new GithubReleaseNotesClient().getFeatureCandidates(
            '2.1.0',
            '2.2.0',
        ),
    ).toEqual({ status: 'ready', candidates: [] });
    respond({ unexpected: true });
    expect(
        await new GithubReleaseNotesClient().getFeatureCandidates(
            '2.1.0',
            '2.2.0',
        ),
    ).toEqual({ status: 'unavailable' });
});

it('caps candidates at 300, retaining the newest versions first', async () => {
    respond([
        release(
            '2.3.0',
            `### Features\n${Array.from({ length: 200 }, (_, index) => `* New feature ${index}`).join('\n')}`,
        ),
        release(
            '2.2.0',
            `### Features\n${Array.from({ length: 200 }, (_, index) => `* Old feature ${index}`).join('\n')}`,
        ),
        release('2.1.0'),
    ]);
    const result = await new GithubReleaseNotesClient().getFeatureCandidates(
        '2.1.0',
        '2.3.0',
    );
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
        expect(result.candidates).toHaveLength(300);
        expect(result.candidates[0].text).toBe('New feature 0');
        expect(result.candidates[299].text).toBe('Old feature 99');
    }
});

it('does not compare commits when release bodies contain only fixes or breaking changes', async () => {
    respond([
        release(
            '2.2.0',
            '### Bug Fixes\n* Fix a bug\n## BREAKING CHANGES\n* Run migrations',
        ),
        release('2.1.0'),
    ]);
    expect(
        await new GithubReleaseNotesClient().getFeatureCandidates(
            '2.1.0',
            '2.2.0',
        ),
    ).toEqual({ status: 'ready', candidates: [] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
});

it('deduplicates repeated pull numbers across release pages before applying the cap', async () => {
    respond([
        release(
            '2.3.0',
            '## Features\n* New ([#1](https://github.com/lightdash/lightdash/issues/1))',
        ),
    ]);
    respond([
        release(
            '2.2.0',
            '## Features\n* Old ([#1](https://github.com/lightdash/lightdash/pull/1))',
        ),
        release('2.1.0'),
    ]);
    const result = await new GithubReleaseNotesClient().getFeatureCandidates(
        '2.1.0',
        '2.3.0',
    );
    expect(result).toEqual({
        status: 'ready',
        candidates: [
            {
                id: 'pr-1',
                version: '2.3.0',
                scope: null,
                text: 'New',
                number: 1,
                relatedNumbers: [1],
                url: 'https://github.com/lightdash/lightdash/pull/1',
            },
        ],
    });
});
