import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    ALLOWED_TOOLS,
    CLAUDE_BASH_GUARD_SCRIPT,
    CLI_WRAPPER_SCRIPT,
    MAX_ONBOARDING_FILE_COUNT,
    MAX_ONBOARDING_FILE_SIZE_BYTES,
    MAX_ONBOARDING_TOTAL_SIZE_BYTES,
} from './constants';
import {
    classifyOnboardingStage,
    containsOnboardingSecret,
    hasCompleteOnboardingOutput,
    sanitizeOnboardingMessage,
    validateOnboardingOutputFileLimits,
} from './utils';

describe('classifyOnboardingStage', () => {
    it.each([
        ['/tmp/ld config get-project', 'preparing_project'],
        ['/tmp/ld warehouse-catalog tables', 'exploring_warehouse'],
        ['lightdash sql "select 1" -o /tmp/profile.csv', 'exploring_warehouse'],
        ['/tmp/ld deploy', 'deploying_semantic_layer'],
        ['/tmp/ld run-chart chart.yml', 'building_dashboard'],
        ['/tmp/ld validate', 'verifying'],
    ] as const)('classifies %s', (command, stage) => {
        expect(classifyOnboardingStage('Bash', { command })).toBe(stage);
    });

    it('classifies semantic layer and dashboard writes', () => {
        expect(
            classifyOnboardingStage('Write', {
                file_path: '/home/user/workspace/models/orders.yml',
            }),
        ).toBe('deploying_semantic_layer');
        expect(
            classifyOnboardingStage('Edit', {
                file_path:
                    '/home/user/workspace/lightdash/dashboards/overview.yml',
            }),
        ).toBe('building_dashboard');
    });

    it('ignores help and unrelated tool calls', () => {
        expect(
            classifyOnboardingStage('Bash', {
                command: '/tmp/ld deploy --help',
            }),
        ).toBeNull();
        expect(classifyOnboardingStage('Read', {})).toBeNull();
    });
});

describe('sanitizeOnboardingMessage', () => {
    it('removes secrets, credential URLs, and sandbox paths', () => {
        const message = sanitizeOnboardingMessage(
            'ldpat_123 at /home/user/workspace/models/orders.yml via /tmp/ld and https://user:password@example.com; key anthropic-secret; prompt /home/user/.ld-onboarding-prompt.txt; log /var/tmp/agent.log',
            ['anthropic-secret'],
        );

        expect(message).toBe(
            '[REDACTED] at models/orders.yml via lightdash and https://[REDACTED]@example.com; key [REDACTED]; prompt the onboarding prompt; log [sandbox path]',
        );
    });
});

describe('hasCompleteOnboardingOutput', () => {
    const completeFiles = [
        { path: 'lightdash.config.yml' },
        { path: 'lightdash/models/orders.yml' },
        { path: 'LIGHTDASH_HANDOFF.md' },
    ];

    it('requires every project output type', () => {
        expect(hasCompleteOnboardingOutput(completeFiles)).toBe(true);
        expect(hasCompleteOnboardingOutput(completeFiles.slice(0, -1))).toBe(
            false,
        );
    });
});

describe('onboarding command policy', () => {
    let testDir: string;
    let wrapperPath: string;
    let hookPath: string;

    beforeAll(() => {
        testDir = mkdtempSync(join(tmpdir(), 'ld-onboarding-policy-'));
        wrapperPath = join(testDir, 'ld');
        hookPath = join(testDir, 'guard.cjs');
        writeFileSync(wrapperPath, CLI_WRAPPER_SCRIPT);
        writeFileSync(hookPath, CLAUDE_BASH_GUARD_SCRIPT);
        writeFileSync(
            join(testDir, 'lightdash'),
            '#!/bin/bash\nprintf \'%s\\n\' "$@"\n',
        );
        chmodSync(wrapperPath, 0o755);
        chmodSync(join(testDir, 'lightdash'), 0o755);
    });

    afterAll(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    const runWrapper = (args: string[]) =>
        spawnSync(wrapperPath, args, {
            encoding: 'utf8',
            env: {
                ...process.env,
                PATH: `${testDir}:${process.env.PATH ?? ''}`,
                LIGHTDASH_PROJECT: 'prepared-project',
                LIGHTDASH_API_KEY: 'ldpat_test',
                ANTHROPIC_API_KEY: 'anthropic-secret',
            },
        });

    const runHook = (command: string) =>
        spawnSync('node', [hookPath], {
            encoding: 'utf8',
            input: JSON.stringify({
                tool_name: 'Bash',
                tool_input: { command },
            }),
        });

    it('uses absolute workspace permissions and only pre-approves the wrapper for Bash', () => {
        expect(ALLOWED_TOOLS).toContain('Bash(/tmp/ld:*)');
        expect(ALLOWED_TOOLS).not.toContain('Bash(cat:*)');
        expect(ALLOWED_TOOLS).not.toContain('Bash(ls:*)');
        expect(ALLOWED_TOOLS).not.toContain('Bash(mkdir:*)');
        expect(ALLOWED_TOOLS).toContain('Write(//home/user/workspace/**)');
    });

    it('strips provider and warehouse credentials but preserves scoped Lightdash auth', () => {
        expect(CLI_WRAPPER_SCRIPT).toContain('ANTHROPIC_*');
        expect(CLI_WRAPPER_SCRIPT).toContain('GITHUB_*');
        expect(CLI_WRAPPER_SCRIPT).toContain('AWS_*');
        expect(CLI_WRAPPER_SCRIPT).toContain('SNOWFLAKE_*');
        expect(CLI_WRAPPER_SCRIPT).toContain('*_PASSWORD');
        expect(CLI_WRAPPER_SCRIPT).toContain(
            'LIGHTDASH_URL|LIGHTDASH_API_KEY|LIGHTDASH_PROJECT',
        );
    });

    it('limits the wrapper to the prepared project and required commands', () => {
        const allowed = runWrapper(['deploy', '--project', 'prepared-project']);
        expect(allowed.status).toBe(0);
        expect(allowed.stdout).toBe('deploy\n--project\nprepared-project\n');
        expect(
            runWrapper([
                'deploy',
                '--project',
                'prepared-project',
                '--project-dir',
                '/home/user/workspace',
                '--assume-yes',
            ]).status,
        ).toBe(0);
        expect(
            runWrapper([
                'upload',
                '--project',
                'prepared-project',
                '--path',
                'lightdash',
                '--validate',
            ]).status,
        ).toBe(0);
        expect(
            runWrapper(['deploy', '--project', 'another-project']).status,
        ).toBe(64);
        expect(
            runWrapper(['config', 'set-project', 'another-project']).status,
        ).toBe(64);
        expect(runWrapper(['rename-project', 'new-name']).status).toBe(64);
        expect(runWrapper(['--help']).status).toBe(0);
        expect(
            runWrapper([
                'sql',
                'select count(*) from orders',
                '-o',
                'orders-profile.csv',
            ]).status,
        ).toBe(0);
        expect(
            runWrapper([
                'sql',
                'select count(*) from orders',
                '-o',
                'lightdash/models/results.yml',
            ]).status,
        ).toBe(64);
        expect(
            runWrapper([
                'sql',
                'with removed as (delete from orders) select count(*) from removed',
                '-o',
                'orders-profile.csv',
            ]).status,
        ).toBe(64);
    });

    it('blocks shell access and expansion before permission evaluation', () => {
        expect(runHook('/tmp/ld lint').status).toBe(0);
        expect(runHook('cat /proc/self/environ').status).toBe(2);
        expect(
            runHook('/tmp/ld sql "select \'$ANTHROPIC_API_KEY\'" -o /tmp/x.csv')
                .status,
        ).toBe(2);
        expect(runHook('/tmp/ld lint > /tmp/output').status).toBe(2);
    });
});

describe('onboarding file persistence policy', () => {
    const file = (
        overrides: Partial<{ path: string; sizeBytes: number }> = {},
    ) => ({
        path: 'lightdash/models/orders.yml',
        sizeBytes: 10,
        updatedAt: new Date(0).toISOString(),
        ...overrides,
    });

    it('rejects oversized files and excessive file counts', () => {
        expect(() =>
            validateOnboardingOutputFileLimits([
                file({ sizeBytes: MAX_ONBOARDING_FILE_SIZE_BYTES + 1 }),
            ]),
        ).toThrow('exceeds');
        expect(() =>
            validateOnboardingOutputFileLimits(
                Array.from(
                    { length: MAX_ONBOARDING_FILE_COUNT + 1 },
                    (_, index) =>
                        file({ path: `lightdash/models/model-${index}.yml` }),
                ),
            ),
        ).toThrow('more than');
        expect(() =>
            validateOnboardingOutputFileLimits(
                Array.from({ length: 11 }, (_, index) =>
                    file({
                        path: `lightdash/models/model-${index}.yml`,
                        sizeBytes: MAX_ONBOARDING_TOTAL_SIZE_BYTES / 10,
                    }),
                ),
            ),
        ).toThrow('total limit');
    });

    it('detects runtime secrets, token formats, private keys, and binary files', () => {
        expect(
            containsOnboardingSecret(Buffer.from('token: runtime-secret'), [
                'runtime-secret',
            ]),
        ).toBe(true);
        expect(
            containsOnboardingSecret(Buffer.from('token: ldpat_abc123'), []),
        ).toBe(true);
        expect(
            containsOnboardingSecret(
                Buffer.from('-----BEGIN PRIVATE KEY-----'),
                [],
            ),
        ).toBe(true);
        expect(containsOnboardingSecret(Buffer.from([0xff]), [])).toBe(true);
        expect(
            containsOnboardingSecret(
                Buffer.from('warehouse:\n  type: postgres'),
                [],
            ),
        ).toBe(false);
    });
});
