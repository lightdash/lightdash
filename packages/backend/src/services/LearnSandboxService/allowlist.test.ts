import { buildArgv, LEARN_TERMINAL_REJECTION } from './allowlist';

const ws = '/tmp/ws';

describe('buildArgv', () => {
    it('accepts lightdash deploy with a selector', () => {
        expect(
            buildArgv(
                {
                    tool: 'lightdash',
                    subcommand: 'deploy',
                    args: ['--select', 'orders'],
                },
                ws,
            ),
        ).toEqual({
            ok: true,
            argv: ['lightdash', 'deploy', '--select', 'orders'],
        });
    });
    it('accepts dbt parse with no args', () => {
        expect(
            buildArgv({ tool: 'dbt', subcommand: 'parse', args: [] }, ws),
        ).toEqual({ ok: true, argv: ['dbt', 'parse'] });
    });
    it('accepts download with charts and a path inside the workspace', () => {
        expect(
            buildArgv(
                {
                    tool: 'lightdash',
                    subcommand: 'download',
                    args: ['--charts', '--path', 'lightdash/charts'],
                },
                ws,
            ),
        ).toEqual({
            ok: true,
            argv: [
                'lightdash',
                'download',
                '--charts',
                '--path',
                'lightdash/charts',
            ],
        });
    });
    it.each([
        ['unknown tool', { tool: 'bash' as never, subcommand: 'x', args: [] }],
        ['dbt run', { tool: 'dbt', subcommand: 'run', args: [] }],
        ['dbt seed', { tool: 'dbt', subcommand: 'seed', args: [] }],
        [
            'deploy --create',
            { tool: 'lightdash', subcommand: 'deploy', args: ['--create'] },
        ],
        [
            'shell metacharacters in selector',
            {
                tool: 'dbt',
                subcommand: 'ls',
                args: ['--select', 'orders; rm -rf /'],
            },
        ],
        [
            'path escaping the workspace',
            {
                tool: 'lightdash',
                subcommand: 'upload',
                args: ['--path', '../../etc'],
            },
        ],
        [
            'absolute path',
            {
                tool: 'lightdash',
                subcommand: 'upload',
                args: ['--path', '/etc'],
            },
        ],
        [
            'flag without value',
            { tool: 'dbt', subcommand: 'ls', args: ['--select'] },
        ],
        [
            'unknown flag',
            {
                tool: 'lightdash',
                subcommand: 'validate',
                args: ['--project', 'x'],
            },
        ],
    ] as const)('rejects %s', (_name, request) => {
        expect(buildArgv(request as never, ws)).toEqual({
            ok: false,
            message: LEARN_TERMINAL_REJECTION,
        });
    });
});
