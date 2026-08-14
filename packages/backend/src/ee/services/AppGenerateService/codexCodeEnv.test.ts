import { MissingConfigError } from '@lightdash/common';
import {
    buildCodexCodeEnv,
    buildCodexExecCommand,
    CODEX_PROJECT_INSTRUCTIONS,
    CODEX_PROJECT_INSTRUCTIONS_PATH,
    codexCodeAllowedHosts,
    codexSkillDirective,
    describeCodexCodeEnv,
    PREPARE_CODEX_SKILLS_COMMAND,
} from './codexCodeEnv';

describe('Codex sandbox configuration', () => {
    test('builds invocation-scoped credentials and egress', () => {
        const config = {
            providers: {
                openai: {
                    apiKey: 'sk-secret',
                    modelName: 'gpt-5.4',
                },
            },
        };

        const env = buildCodexCodeEnv(config);
        expect(env).toEqual({
            CODEX_API_KEY: 'sk-secret',
            OPENAI_BASE_URL: 'https://api.openai.com/v1',
        });
        expect(codexCodeAllowedHosts(config)).toEqual(['api.openai.com']);
        const selectedEnv = {
            ...env,
            DATA_APP_CODEX_MODEL: 'gpt-5.6-terra',
        };
        expect(describeCodexCodeEnv(selectedEnv)).toBe(
            'Codex/OpenAI (model=gpt-5.6-terra)',
        );
        expect(describeCodexCodeEnv(selectedEnv)).not.toContain('sk-secret');
    });

    test('uses only the custom base URL host for egress', () => {
        const config = {
            providers: {
                openai: {
                    apiKey: 'sk-secret',
                    modelName: 'custom-model',
                    baseUrl: 'https://openai.example.com/v1',
                },
            },
        };

        expect(buildCodexCodeEnv(config).OPENAI_BASE_URL).toBe(
            'https://openai.example.com/v1',
        );
        expect(codexCodeAllowedHosts(config)).toEqual(['openai.example.com']);
    });

    test('fails before sandbox launch when OpenAI is unavailable', () => {
        expect(() => buildCodexCodeEnv({ providers: {} })).toThrowError(
            MissingConfigError,
        );
    });

    test('builds a non-interactive, networkless command that hides credentials from tools', () => {
        const command = buildCodexExecCommand({
            reasoningEffort: 'high',
            outputSchemaPath: '/tmp/output-schema.json',
        });

        expect(command).toContain('--ephemeral');
        expect(command).toContain('--sandbox workspace-write');
        expect(command).toContain('approval_policy="never"');
        expect(command).toContain('model_reasoning_summary="detailed"');
        expect(command).toContain('model_supports_reasoning_summaries=true');
        expect(command).toContain(
            'sandbox_workspace_write.network_access=false',
        );
        expect(command).toContain(
            'shell_environment_policy.exclude=["CODEX_API_KEY","OPENAI_API_KEY"]',
        );
        expect(command).not.toContain('model_instructions_file');
        expect(command).toContain('--cd /app/src');
        expect(command).toContain('--output-schema /tmp/output-schema.json');
    });

    test('uses native project instructions and exposes the applicable skills', () => {
        expect(CODEX_PROJECT_INSTRUCTIONS_PATH).toBe('/app/src/AGENTS.md');
        expect(CODEX_PROJECT_INSTRUCTIONS).toContain(
            'read `/app/effective-skill.md` completely',
        );
        expect(CODEX_PROJECT_INSTRUCTIONS).toContain('`$frontend-design`');
        expect(CODEX_PROJECT_INSTRUCTIONS).toContain(
            '`$reusable-visualization`',
        );
        expect(CODEX_PROJECT_INSTRUCTIONS).toContain('`$sdk-features`');
        expect(PREPARE_CODEX_SKILLS_COMMAND).toContain(
            '/app/src/.agents/skills',
        );
        expect(codexSkillDirective(false)).toContain('$frontend-design');
        expect(codexSkillDirective(true)).toContain('$reusable-visualization');
    });
});
