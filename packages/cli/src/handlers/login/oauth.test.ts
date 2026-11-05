import { openBrowser } from './oauth';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('child_process', () => ({
    exec: (_command: string, callback: (error: Error | null) => void) => {
        execute().then(() => callback(null), callback);
    },
}));

beforeEach(() => {
    vi.resetAllMocks();
});

it('reports when the browser launch command succeeds', async () => {
    execute.mockResolvedValue(undefined);
    await expect(openBrowser('https://example.com/connect')).resolves.toBe(
        true,
    );
});

it('reports when the browser launch command fails', async () => {
    execute.mockRejectedValue(new Error('No browser'));
    await expect(openBrowser('https://example.com/connect')).resolves.toBe(
        false,
    );
});
