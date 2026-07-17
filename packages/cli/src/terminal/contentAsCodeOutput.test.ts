import GlobalState from '../globalState';
import {
    createContentAsCodeOutput,
    formatContentAsCodeAction,
    formatContentAsCodeComplete,
    formatContentAsCodeFailure,
    formatContentAsCodeProgress,
} from './contentAsCodeOutput';

describe('content as code terminal output', () => {
    it('formats fallback actions with aligned labels and muted metadata', () => {
        const output = formatContentAsCodeAction({
            label: 'Custom roles',
            detail: '34 downloaded',
            durationMs: 245,
        });

        expect(output).toContain('Custom roles   34 downloaded (245ms)');
    });

    it('formats running progress as a tree', () => {
        const output = formatContentAsCodeProgress({
            operation: 'download',
            scope: 'organization',
            activeLabel: 'Groups',
            items: [
                {
                    label: 'Custom roles',
                    detail: '34 downloaded',
                    durationMs: 85,
                },
                {
                    label: 'Users',
                    detail: '9 downloaded',
                    durationMs: 107,
                },
            ],
        });

        expect(output).toContain('Downloading content as code (organization)');
        expect(output).toContain('└ ✓ Custom roles · 34 downloaded (85ms)');
        expect(output).toContain('└ ✓ Users · 9 downloaded (107ms)');
        expect(output).toContain('└ ◐ Groups · downloading…');
    });

    it('renders one borderless completion tree', () => {
        const output = formatContentAsCodeComplete({
            operation: 'upload',
            scope: 'organization',
            path: '/tmp/lightdash',
            elapsedSeconds: 1.2,
            items: [
                {
                    label: 'Custom roles',
                    detail: '1 created, 2 unchanged',
                    durationMs: 245,
                },
                { label: 'Users', detail: '4 updated', durationMs: 31 },
                {
                    label: 'Groups',
                    detail: 'service unavailable',
                    durationMs: 12,
                    variant: 'warning',
                },
            ],
        });

        expect(output).toContain(
            '✓ Uploaded content as code (organization) · 1.2s',
        );
        expect(output).toContain('└ ✓ Custom roles');
        expect(output).toContain('(245ms)');
        expect(output).toContain('└ ⚠ Groups');
        expect(output).toContain('└ Read from /tmp/lightdash');
        expect(output).not.toMatch(/[╭╮╰╯│─]/);
    });

    it('formats failures with completed and failed tree rows', () => {
        const output = formatContentAsCodeFailure({
            operation: 'download',
            scope: 'organization',
            elapsedSeconds: 0.4,
            items: [
                {
                    label: 'Custom roles',
                    detail: '34 downloaded',
                    durationMs: 85,
                },
            ],
            failedItem: {
                label: 'Users',
                detail: '403 forbidden',
                durationMs: 52,
            },
        });

        expect(output).toContain(
            'Failed to download content as code (organization) · 0.4s',
        );
        expect(output).toContain('└ ✓ Custom roles · 34 downloaded (85ms)');
        expect(output).toContain('└ × Users · 403 forbidden (52ms)');
    });

    it('replaces running progress with one persistent completion tree', () => {
        const originalIsTTY = process.stderr.isTTY;
        Object.defineProperty(process.stderr, 'isTTY', {
            configurable: true,
            value: true,
        });
        vi.stubEnv('CI', 'false');
        vi.stubEnv('TERM', 'xterm');
        vi.stubEnv('NO_UNICODE', 'false');
        const spinner = {
            text: '',
            start: vi.fn(),
            succeed: vi.fn(),
            stop: vi.fn(),
            fail: vi.fn(),
        };
        vi.spyOn(GlobalState, 'startSpinner').mockReturnValue(spinner as never);
        const write = vi
            .spyOn(process.stderr, 'write')
            .mockImplementation(() => true);

        const output = createContentAsCodeOutput({
            operation: 'download',
            scope: 'organization',
            initialLabel: 'Custom roles',
        });
        output.completeItem(
            {
                label: 'Custom roles',
                detail: '34 downloaded',
                durationMs: 85,
            },
            'Users',
        );

        expect(spinner.succeed).not.toHaveBeenCalled();
        expect(spinner.text).toContain('└ ◐ Users · downloading…');
        expect(output.complete('/tmp/lightdash', 0.6)).toBe(true);
        expect(spinner.stop).toHaveBeenCalledOnce();
        expect(write).toHaveBeenCalledOnce();

        Object.defineProperty(process.stderr, 'isTTY', {
            configurable: true,
            value: originalIsTTY,
        });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });
});
