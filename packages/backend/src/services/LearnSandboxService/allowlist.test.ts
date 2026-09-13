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
    it('accepts --path . for uploading the whole project', () => {
        expect(
            buildArgv(
                {
                    tool: 'lightdash',
                    subcommand: 'upload',
                    args: ['--path', '.'],
                },
                ws,
            ),
        ).toEqual({
            ok: true,
            argv: ['lightdash', 'upload', '--path', '.'],
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
            'flag-like selector value',
            { tool: 'dbt', subcommand: 'ls', args: ['--select', '-x'] },
        ],
        [
            'flag-like path value',
            {
                tool: 'lightdash',
                subcommand: 'upload',
                args: ['--path', '--charts'],
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
        [
            'prototype-polluting tool name',
            { tool: 'toString' as never, subcommand: 'parse', args: [] },
        ],
        [
            'prototype-polluting subcommand: toString',
            { tool: 'dbt', subcommand: 'toString', args: [] },
        ],
        [
            'prototype-polluting subcommand: constructor',
            { tool: 'dbt', subcommand: 'constructor', args: [] },
        ],
        [
            'prototype-polluting subcommand: __proto__',
            { tool: 'dbt', subcommand: '__proto__', args: [] },
        ],
        [
            'more than 16 args, even though each pair would otherwise be valid',
            {
                tool: 'dbt',
                subcommand: 'ls',
                args: Array.from({ length: 9 }, () => [
                    '--select',
                    'orders',
                ]).flat(), // 18 args
            },
        ],
    ] as const)('rejects %s', (_name, request) => {
        expect(buildArgv(request as never, ws)).toEqual({
            ok: false,
            message: LEARN_TERMINAL_REJECTION,
        });
    });

    it('accepts exactly 16 args', () => {
        const args = Array.from({ length: 8 }, () => [
            '--select',
            'orders',
        ]).flat();
        expect(args).toHaveLength(16);
        expect(buildArgv({ tool: 'dbt', subcommand: 'ls', args }, ws)).toEqual({
            ok: true,
            argv: ['dbt', 'ls', ...args],
        });
    });
});
