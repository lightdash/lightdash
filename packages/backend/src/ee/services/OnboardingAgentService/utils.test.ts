import { describe, expect, it } from 'vitest';
import { ALLOWED_TOOLS, CLI_WRAPPER_SCRIPT } from './constants';
import {
    buildManagedOnboardingPrompt,
    classifyOnboardingStage,
    sanitizeOnboardingMessage,
} from './utils';

describe('buildManagedOnboardingPrompt', () => {
    it('replaces only section 1 and resumes at semantic-layer discovery', () => {
        const prompt = buildManagedOnboardingPrompt({
            basePrompt:
                '# Complete Lightdash project setup\n\n## 1. Bootstrap\n\n## 2. Discover, author, and deploy the semantic layer',
            siteUrl: 'https://example.lightdash.cloud',
            projectUuid: 'project-uuid',
            warehouseType: 'snowflake',
            database: 'analytics',
            schema: 'public',
        });

        expect(prompt).toContain('these replace section 1');
        expect(prompt).toContain('Skip section 1 entirely');
        expect(prompt).toContain('Do NOT run `lightdash login`');
        expect(prompt).toContain(
            '`/tmp/ld config get-project` and confirm it matches the prepared project UUID, then continue from section 2',
        );
        expect(prompt).toContain(
            '## 2. Discover, author, and deploy the semantic layer',
        );
        expect(prompt.indexOf('`/tmp/ld config get-project`')).toBeLessThan(
            prompt.indexOf(
                '## 2. Discover, author, and deploy the semantic layer',
            ),
        );
        expect(prompt).not.toMatch(/skip(?:ping)? (?:section )?2/i);
        expect(prompt).not.toMatch(/skip[^\n]*semantic/i);
        expect(prompt).not.toMatch(/six[- ]gate|six gates|first six/i);
    });
});

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

describe('onboarding command policy', () => {
    it('allows only the secret-stripping wrapper as a Bash command', () => {
        expect(ALLOWED_TOOLS).toContain('Bash(/tmp/ld:*)');
        expect(ALLOWED_TOOLS).not.toContain('Bash(cat:*)');
        expect(ALLOWED_TOOLS).not.toContain('Bash(ls:*)');
        expect(ALLOWED_TOOLS).not.toContain('Bash(mkdir:*)');
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
});
