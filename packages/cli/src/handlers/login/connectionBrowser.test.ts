import { AsyncResource } from 'async_hooks';
import { execFile } from 'child_process';
import { runWithAgentConnectionSelection } from '../../credentials';
import { openConnectionBrowser } from './connectionBrowser';

vi.mock('child_process', () => ({ execFile: vi.fn() }));
beforeEach(() => {
    vi.mocked(execFile).mockReset();
});
afterEach(() => vi.restoreAllMocks());
it.each([
    ['darwin', 'open'],
    ['linux', 'xdg-open'],
    ['win32', 'rundll32.exe'],
])('passes URL as one data argument on %s', async (platform, executable) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(
        platform as NodeJS.Platform,
    );
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
        const callback = args[3];
        if (typeof callback === 'function') callback(null);
        return {} as ReturnType<typeof execFile>;
    });
    const url = 'https://example.com/?x=$(touch /tmp/unsafe);&y="quoted"';
    expect(await openConnectionBrowser(url)).toBe(true);
    expect(execFile).toHaveBeenLastCalledWith(
        executable,
        platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url],
        expect.objectContaining({ timeout: 5000, shell: false }),
        expect.any(Function),
    );
});
it('reports launch errors without printing their secret-bearing details', async () => {
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
        const callback = args[3];
        if (typeof callback === 'function')
            callback(new Error('private-secret'));
        return {} as ReturnType<typeof execFile>;
    });
    const error = vi.spyOn(console, 'error');
    expect(await openConnectionBrowser('https://example.com')).toBe(false);
    expect(error).not.toHaveBeenCalled();
});

it('does not pass personal CLI or proxy credentials to the browser process', async () => {
    vi.stubEnv('LIGHTDASH_API_KEY', 'personal-key');
    vi.stubEnv('LIGHTDASH_PROXY_AUTHORIZATION', 'personal-proxy');
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
        const callback = args[3];
        if (typeof callback === 'function') callback(null);
        return {} as ReturnType<typeof execFile>;
    });
    await openConnectionBrowser('https://example.com');
    const options = vi.mocked(execFile).mock.calls.at(-1)?.[2];
    expect(options).toMatchObject({ env: expect.any(Object) });
    expect(options).not.toMatchObject({
        env: expect.objectContaining({ LIGHTDASH_API_KEY: 'personal-key' }),
    });
    expect(options).not.toMatchObject({
        env: expect.objectContaining({
            LIGHTDASH_PROXY_AUTHORIZATION: 'personal-proxy',
        }),
    });
    vi.unstubAllEnvs();
});

it('runs a launcher with metacharacters as data and no shell expansion', async () => {
    const { promises: fs } = await import('fs');
    const { tmpdir } = await import('os');
    const path = await import('path');
    const actual =
        await vi.importActual<typeof import('child_process')>('child_process');
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'browser-data-'));
    const outputPath = path.join(directory, 'arguments.json');
    const marker = path.join(directory, 'must-not-exist');
    const command = path.join(directory, 'xdg-open');
    try {
        await fs.writeFile(
            command,
            `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(process.argv.slice(2)));\n`,
            { mode: 0o700 },
        );
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        vi.stubEnv('PATH', `${directory}:${process.env.PATH}`);
        vi.mocked(execFile).mockImplementation(actual.execFile);
        const url = `https://example.com/?q=$(touch ${marker});&value="quoted"`;
        expect(await openConnectionBrowser(url)).toBe(true);
        expect(JSON.parse(await fs.readFile(outputPath, 'utf8'))).toEqual([
            url,
        ]);
        await expect(fs.stat(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
        vi.unstubAllEnvs();
        await fs.rm(directory, { recursive: true, force: true });
    }
});
it('terminates a stalled launcher within its five-second bound', async () => {
    const { promises: fs } = await import('fs');
    const { tmpdir } = await import('os');
    const path = await import('path');
    const actual =
        await vi.importActual<typeof import('child_process')>('child_process');
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'browser-timeout-'));
    try {
        await fs.writeFile(
            path.join(directory, 'xdg-open'),
            `#!${process.execPath}\nsetTimeout(() => {}, 60000);\n`,
            { mode: 0o700 },
        );
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        vi.stubEnv('PATH', `${directory}:${process.env.PATH}`);
        vi.mocked(execFile).mockImplementation(actual.execFile);
        const started = Date.now();
        expect(await openConnectionBrowser('https://example.com')).toBe(false);
        expect(Date.now() - started).toBeLessThan(10000);
    } finally {
        vi.unstubAllEnvs();
        await fs.rm(directory, { recursive: true, force: true });
    }
}, 15000);

it('refuses a selected invocation before launching a browser', () => {
    vi.mocked(execFile).mockClear();
    expect(() =>
        runWithAgentConnectionSelection('work', () =>
            openConnectionBrowser('https://example.com'),
        ),
    ).toThrow('This command requires your personal CLI login.');
    expect(execFile).not.toHaveBeenCalled();
});
it('retains the missing-context guard at the new child boundary', async () => {
    vi.mocked(execFile).mockClear();
    const outside = new AsyncResource('connection-browser-outside');
    let finish: () => void = () => {};
    const held = runWithAgentConnectionSelection(
        'work',
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
    );
    try {
        expect(() =>
            outside.runInAsyncScope(() =>
                openConnectionBrowser('https://example.com'),
            ),
        ).toThrow('this request cannot use your personal CLI login');
        expect(execFile).not.toHaveBeenCalled();
    } finally {
        finish();
        await held;
        outside.emitDestroy();
    }
});
