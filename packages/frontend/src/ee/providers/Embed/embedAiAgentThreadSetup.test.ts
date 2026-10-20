import { describe, expect, it } from 'vitest';
import {
    buildEmbedHash,
    getEmbedAiAgentThreadSetup,
    getThreadSetupRequestFields,
    parseEmbedHash,
} from './embedAiAgentThreadSetup';

const TOKEN = 'header.payload.signature';
const DASHBOARD_UUID = '7f1b3a52-1c8e-4c3f-9f2e-0d5a6b7c8d9e';

describe('embed AI agent thread setup', () => {
    it('keeps a token-only hash unchanged', () => {
        expect(buildEmbedHash(TOKEN, null)).toBe(TOKEN);
        expect(parseEmbedHash(`#${TOKEN}`)).toEqual({
            token: TOKEN,
            aiAgentThreadSetup: null,
        });
    });

    it('round-trips a binding and context through the hash', () => {
        const setup = {
            binding: {
                type: 'dashboard' as const,
                dashboardUuid: DASHBOARD_UUID,
            },
            threadContext: 'Summary: revenue & churn = 50%\nNext: café #2',
        };
        const url = new URL('https://example.com/embed');
        url.hash = buildEmbedHash(TOKEN, setup);

        expect(parseEmbedHash(url.hash)).toEqual({
            token: TOKEN,
            aiAgentThreadSetup: setup,
        });
    });

    it('carries only the context when there is no binding', () => {
        const parsed = parseEmbedHash(
            `#${buildEmbedHash(TOKEN, { binding: null, threadContext: 'Notes' })}`,
        );

        expect(parsed.aiAgentThreadSetup).toEqual({
            binding: null,
            threadContext: 'Notes',
        });
    });

    it('ignores unknown hash params', () => {
        expect(parseEmbedHash(`#${TOKEN}&other=1`)).toEqual({
            token: TOKEN,
            aiAgentThreadSetup: null,
        });
    });

    it('treats a blank context as no setup', () => {
        expect(
            getEmbedAiAgentThreadSetup({
                binding: undefined,
                threadContext: '',
            }),
        ).toBeNull();
    });

    it('omits both request fields without a setup', () => {
        expect(JSON.stringify(getThreadSetupRequestFields(null))).toBe('{}');
    });
});
