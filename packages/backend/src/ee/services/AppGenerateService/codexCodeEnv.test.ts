import { MissingConfigError } from '@lightdash/common';
import {
    buildCodexCodeEnv,
    buildCodexExecCommand,
    CODEX_PROJECT_INSTRUCTIONS,
    CODEX_PROJECT_INSTRUCTIONS_PATH,
    codexCodeAllowedHosts,
    codexSkillDirective,
    describeCodexCodeEnv,
    getCodexCodeProvider,
    getCodexModelId,
    PREPARE_CODEX_SKILLS_COMMAND,
} from './codexCodeEnv';

describe('Codex sandbox configuration', () => {
    test('builds invocation-scoped credentials and egress', () => {
        const config = {
            defaultProvider: 'openai',
            providers: {
                openai: {
                    apiKey: 'sk-secret',
                    modelName: 'gpt-5.4',
                },
            },
        };

        const env = buildCodexCodeEnv(config);
        expect(env).toEqual({
            DATA_APP_CODEX_PROVIDER: 'openai',
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
        expect(getCodexCodeProvider(env)).toBe('openai');
        expect(getCodexModelId('openai', 'gpt-5.6-terra')).toBe(
            'gpt-5.6-terra',
        );
    });

    test('uses only the custom base URL host for egress', () => {
        const config = {
            defaultProvider: 'openai',
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
        expect(() =>
            buildCodexCodeEnv({ defaultProvider: 'openai', providers: {} }),
        ).toThrowError(MissingConfigError);
    });

    test('builds native Bedrock API-key credentials, model id, and egress', () => {
        const config = {
            defaultProvider: 'bedrock',
            providers: {
                bedrock: {
                    apiKey: 'bedrock-secret',
                    region: 'us-east-2',
                },
            },
        };

        const env = buildCodexCodeEnv(config);
        expect(env).toEqual({
            DATA_APP_CODEX_PROVIDER: 'amazon-bedrock',
            AWS_REGION: 'us-east-2',
            AWS_BEARER_TOKEN_BEDROCK: 'bedrock-secret',
        });
        expect(getCodexCodeProvider(env)).toBe('amazon-bedrock');
        expect(getCodexModelId('amazon-bedrock', 'gpt-5.6-terra')).toBe(
            'openai.gpt-5.6-terra',
        );
        expect(codexCodeAllowedHosts(config)).toEqual([
            'bedrock-mantle.us-east-2.api.aws',
        ]);
        expect(
            describeCodexCodeEnv({
                ...env,
                DATA_APP_CODEX_MODEL: 'gpt-5.6-terra',
            }),
        ).toBe(
            'Codex/Bedrock (API key, region=us-east-2, model=gpt-5.6-terra)',
        );
        expect(describeCodexCodeEnv(env)).not.toContain('bedrock-secret');
    });

    test('builds native Bedrock IAM credentials', () => {
        expect(
            buildCodexCodeEnv({
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        region: 'eu-west-1',
                        accessKeyId: 'access-key',
                        secretAccessKey: 'secret-key',
                        sessionToken: 'session-token',
                    },
                },
            }),
        ).toEqual({
            DATA_APP_CODEX_PROVIDER: 'amazon-bedrock',
            AWS_REGION: 'eu-west-1',
            AWS_ACCESS_KEY_ID: 'access-key',
            AWS_SECRET_ACCESS_KEY: 'secret-key',
            AWS_SESSION_TOKEN: 'session-token',
        });
    });

    test('fails before sandbox launch when Bedrock is incomplete', () => {
        expect(() =>
            buildCodexCodeEnv({
                defaultProvider: 'bedrock',
                providers: {},
            }),
        ).toThrow('BEDROCK_API_KEY');
        expect(() =>
            buildCodexCodeEnv({
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: { apiKey: 'bedrock-secret', region: '' },
                },
            }),
        ).toThrow('BEDROCK_REGION');
    });

    test('builds a non-interactive, networkless command that hides credentials from tools', () => {
        const command = buildCodexExecCommand({
            provider: 'openai',
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
        for (const secret of [
            'CODEX_API_KEY',
            'OPENAI_API_KEY',
            'AWS_BEARER_TOKEN_BEDROCK',
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
        ]) {
            expect(command).toContain(secret);
        }
        expect(command).not.toContain('model_instructions_file');
        expect(command).toContain('--cd /app/src');
        expect(command).toContain('--model "$DATA_APP_CODEX_MODEL_ID"');
        expect(command).toContain('openai_base_url="$OPENAI_BASE_URL"');
        expect(command).not.toContain('model_provider="amazon-bedrock"');
        expect(command).toContain('--output-schema /tmp/output-schema.json');
    });

    test('builds a native Amazon Bedrock command', () => {
        const command = buildCodexExecCommand({
            provider: 'amazon-bedrock',
            reasoningEffort: 'low',
            outputSchemaPath: null,
        });

        expect(command).toContain('model_provider="amazon-bedrock"');
        expect(command).not.toContain('openai_base_url');
        expect(command).toContain('--model "$DATA_APP_CODEX_MODEL_ID"');
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
