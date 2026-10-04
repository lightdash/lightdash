import { LEARN_TERMINAL_SUBCOMMANDS } from '@lightdash/common';
import {
    buildArgv,
    LEARN_TERMINAL_REJECTION,
    PREVIEW_NAME_REQUIRED,
    previewName,
    toSpawnArgv,
} from './allowlist';

describe('the shared subcommand list', () => {
    it('is exactly what buildArgv accepts, so the browser and the server agree', () => {
        for (const tool of ['lightdash', 'dbt'] as const) {
            for (const subcommand of LEARN_TERMINAL_SUBCOMMANDS[tool]) {
                // Known to the server: it runs as typed, or asks for the
                // argument it requires (start-preview's name). Only an
                // unknown one gets the generic refusal.
                const answer = buildArgv(
                    { tool, subcommand, args: [] },
                    '/tmp/ws',
                );
                expect(
                    answer.ok || answer.message !== LEARN_TERMINAL_REJECTION,
                ).toBe(true);
            }
            expect(
                buildArgv({ tool, subcommand: 'depl', args: [] }, '/tmp/ws'),
            ).toEqual({ ok: false, message: LEARN_TERMINAL_REJECTION });
        }
    });
});

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
    it('refuses a selector on dbt parse, which dbt itself does not take', () => {
        expect(
            buildArgv(
                {
                    tool: 'dbt',
                    subcommand: 'parse',
                    args: ['--select', 'orders'],
                },
                ws,
            ),
        ).toEqual({ ok: false, message: LEARN_TERMINAL_REJECTION });
        expect(
            buildArgv(
                {
                    tool: 'dbt',
                    subcommand: 'compile',
                    args: ['--select', 'orders'],
                },
                ws,
            ),
        ).toMatchObject({ ok: true });
    });

    it('accepts dbt parse with no args', () => {
        expect(
            buildArgv({ tool: 'dbt', subcommand: 'parse', args: [] }, ws),
        ).toEqual({ ok: true, argv: ['dbt', 'parse'] });
    });
    it('accepts download with a chart slug and a path inside the workspace', () => {
        expect(
            buildArgv(
                {
                    tool: 'lightdash',
                    subcommand: 'download',
                    args: [
                        '--charts',
                        'revenue-by-payment-method',
                        '--path',
                        'lightdash/charts',
                    ],
                },
                ws,
            ),
        ).toEqual({
            ok: true,
            argv: [
                'lightdash',
                'download',
                '--charts',
                'revenue-by-payment-method',
                '--path',
                'lightdash/charts',
            ],
        });
    });
    it('accepts short flags and several slugs, as the CLI does', () => {
        expect(
            buildArgv(
                {
                    tool: 'lightdash',
                    subcommand: 'download',
                    args: [
                        '-c',
                        'orders-over-time',
                        'top-customers',
                        '-d',
                        'jaffle-shop-overview',
                    ],
                },
                ws,
            ),
        ).toEqual({
            ok: true,
            argv: [
                'lightdash',
                'download',
                '-c',
                'orders-over-time',
                'top-customers',
                '-d',
                'jaffle-shop-overview',
            ],
        });
    });
    it('accepts --force on upload', () => {
        expect(
            buildArgv(
                {
                    tool: 'lightdash',
                    subcommand: 'upload',
                    args: ['--force', '--charts', 'revenue-by-payment-method'],
                },
                ws,
            ),
        ).toEqual({
            ok: true,
            argv: [
                'lightdash',
                'upload',
                '--force',
                '--charts',
                'revenue-by-payment-method',
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
        [
            'bare --charts',
            { tool: 'lightdash', subcommand: 'download', args: ['--charts'] },
        ],
        ['bare -d', { tool: 'lightdash', subcommand: 'upload', args: ['-d'] }],
        [
            '--force on download',
            {
                tool: 'lightdash',
                subcommand: 'download',
                args: ['--force', '--charts', 'orders-over-time'],
            },
        ],
        [
            'a slug that looks like a flag',
            {
                tool: 'lightdash',
                subcommand: 'download',
                args: ['--charts', '-x'],
            },
        ],
        [
            'an uppercase slug',
            {
                tool: 'lightdash',
                subcommand: 'download',
                args: ['--charts', 'Orders'],
            },
        ],
        [
            'a slug with a slash',
            {
                tool: 'lightdash',
                subcommand: 'download',
                args: ['--charts', 'charts/orders'],
            },
        ],
        [
            'a slug that walks up',
            { tool: 'lightdash', subcommand: 'upload', args: ['-c', '..'] },
        ],
        [
            'more than eight slugs',
            {
                tool: 'lightdash',
                subcommand: 'download',
                args: ['--charts', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
            },
        ],
        [
            'a slug over 255 characters',
            {
                tool: 'lightdash',
                subcommand: 'download',
                args: ['--charts', 'a'.repeat(256)],
            },
        ],
        [
            'charts on compile',
            {
                tool: 'lightdash',
                subcommand: 'compile',
                args: ['--charts', 'orders-over-time'],
            },
        ],
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

describe('lightdash start-preview', () => {
    const startPreview = (args: string[]) =>
        buildArgv({ tool: 'lightdash', subcommand: 'start-preview', args }, ws);

    it('is accepted with the name the CLI requires, and stored as typed', () => {
        expect(startPreview(['--name', 'my-preview'])).toEqual({
            ok: true,
            argv: ['lightdash', 'start-preview', '--name', 'my-preview'],
        });
        expect(
            startPreview(['--select', 'payments', '--name', 'my-preview']),
        ).toEqual({
            ok: true,
            argv: [
                'lightdash',
                'start-preview',
                '--select',
                'payments',
                '--name',
                'my-preview',
            ],
        });
    });

    it('accepts the names the docs use', () => {
        ['PR: Add Revenue Metric', 'ecom-shop-analytics', 'v2.1'].forEach(
            (name) => expect(startPreview(['--name', name]).ok).toBe(true),
        );
    });

    it("says a name is required, in the CLI's words, when there is none", () => {
        expect(startPreview([])).toEqual({
            ok: false,
            message: PREVIEW_NAME_REQUIRED,
        });
        expect(startPreview(['--select', 'payments'])).toEqual({
            ok: false,
            message: PREVIEW_NAME_REQUIRED,
        });
        expect(PREVIEW_NAME_REQUIRED).toMatch(/^--name argument is required/);
    });

    it.each([
        ['no value', ['--name']],
        ['a flag for a value', ['--name', '--select']],
        ['an empty value', ['--name', '']],
        ['a path', ['--name', '../other']],
        ['a shell word', ['--name', 'a;rm -rf']],
        ['a name over 64 characters', ['--name', 'a'.repeat(65)]],
        ['a second name', ['--name', 'one', '--name', 'two']],
    ])('refuses %s', (_case, args) => {
        expect(startPreview(args)).toEqual({
            ok: false,
            message: LEARN_TERMINAL_REJECTION,
        });
    });

    it('takes no name on any other command', () => {
        expect(
            buildArgv(
                {
                    tool: 'lightdash',
                    subcommand: 'deploy',
                    args: ['--name', 'mine'],
                },
                ws,
            ),
        ).toEqual({ ok: false, message: LEARN_TERMINAL_REJECTION });
    });

    it('spawns as a deploy to the copy: the name is set aside, other flags kept', () => {
        expect(
            toSpawnArgv([
                'lightdash',
                'start-preview',
                '--name',
                'my-preview',
                '--select',
                'payments',
            ]),
        ).toEqual(['lightdash', 'deploy', '--select', 'payments']);
        expect(
            toSpawnArgv([
                'lightdash',
                'start-preview',
                '--select',
                'payments',
                '--name',
                'PR: Add Revenue Metric',
            ]),
        ).toEqual(['lightdash', 'deploy', '--select', 'payments']);
        expect(toSpawnArgv(['lightdash', 'deploy'])).toEqual([
            'lightdash',
            'deploy',
        ]);
        expect(toSpawnArgv(['dbt', 'parse'])).toEqual(['dbt', 'parse']);
    });

    it('reads the name back from a stored command', () => {
        expect(
            previewName(['lightdash', 'start-preview', '--name', 'my-preview']),
        ).toBe('my-preview');
        expect(previewName(['lightdash', 'deploy'])).toBeUndefined();
    });
});
