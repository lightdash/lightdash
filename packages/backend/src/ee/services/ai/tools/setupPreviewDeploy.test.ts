import {
    ForbiddenError,
    toolSetupPreviewDeployOutputSchema,
    type PreviewDeploySetupResult,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { getSetupPreviewDeploy } from './setupPreviewDeploy';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const setup: PreviewDeploySetupResult = {
    prUrl: 'https://github.com/acme/dbt/pull/42',
    projectName: 'Jaffle shop',
    repository: 'acme/dbt',
    secrets: [
        {
            name: 'LIGHTDASH_URL',
            value: 'https://app.lightdash.cloud',
            description: 'The base URL of your Lightdash instance.',
        },
        {
            name: 'LIGHTDASH_API_KEY',
            value: null,
            description: 'A personal access token.',
        },
    ],
};

const execute = async (tool: ReturnType<typeof getSetupPreviewDeploy>) => {
    if (!tool.execute) throw new Error('tool has no execute');
    return tool.execute({}, { messages: [], toolCallId: 'tool-call-1' });
};

describe('getSetupPreviewDeploy', () => {
    it('returns the opened PR as text, metadata and structured content', async () => {
        const output = await execute(
            getSetupPreviewDeploy({
                setupPreviewDeploy: vi.fn().mockResolvedValue(setup),
            }),
        );

        expect(
            toolSetupPreviewDeployOutputSchema.safeParse(output).success,
        ).toBe(true);
        const parsed = toolSetupPreviewDeployOutputSchema.parse(output);

        expect(parsed.metadata).toEqual({
            status: 'success',
            prUrl: 'https://github.com/acme/dbt/pull/42',
        });
        expect(parsed.structuredContent).toEqual(setup);

        expect(parsed.result).toContain(
            'Lightdash project "Jaffle shop" (repository acme/dbt)',
        );
        expect(parsed.result).toContain(
            '- LIGHTDASH_URL = `https://app.lightdash.cloud` (pre-filled — show this exact value) — The base URL of your Lightdash instance.',
        );
        expect(parsed.result).toContain(
            '- LIGHTDASH_API_KEY — A personal access token. (the user must provide this)',
        );
        expect(parsed.result).not.toContain(setup.prUrl);
    });

    it('mirrors the error text in structured content when setup fails', async () => {
        const output = await execute(
            getSetupPreviewDeploy({
                setupPreviewDeploy: vi
                    .fn()
                    .mockRejectedValue(new ForbiddenError('No write access')),
            }),
        );

        expect(
            toolSetupPreviewDeployOutputSchema.safeParse(output).success,
        ).toBe(true);
        const parsed = toolSetupPreviewDeployOutputSchema.parse(output);

        expect(parsed.metadata).toEqual({ status: 'error' });
        expect(parsed.result).toContain(
            'Error setting up preview deploys. No pull request was opened.',
        );
        expect(parsed.result).toContain('No write access');
        expect(parsed.structuredContent).toEqual({ error: parsed.result });
    });
});
