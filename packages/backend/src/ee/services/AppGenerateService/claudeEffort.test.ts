import {
    DATA_APP_VIZ_TEMPLATE,
    type AppGeneratePipelineJobPayload,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    jobClaudeEffort,
    payloadClaudeEffort,
    resolveClaudeEffort,
} from './claudeEffort';

const payload = (
    overrides: Partial<AppGeneratePipelineJobPayload>,
): AppGeneratePipelineJobPayload => ({
    appUuid: 'app-uuid',
    version: 2,
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    userUuid: 'user-uuid',
    prompt: 'make it horizontal',
    isIteration: true,
    ...overrides,
});

describe('resolveClaudeEffort', () => {
    it('runs first builds low', () => {
        expect(resolveClaudeEffort(1, 'dashboard')).toBe('low');
        expect(resolveClaudeEffort(1, null)).toBe('low');
    });

    it('runs data app iterations high', () => {
        expect(resolveClaudeEffort(2, 'dashboard')).toBe('high');
        expect(resolveClaudeEffort(7, null)).toBe('high');
    });

    it('runs chart type iterations low', () => {
        expect(resolveClaudeEffort(1, DATA_APP_VIZ_TEMPLATE)).toBe('low');
        expect(resolveClaudeEffort(2, DATA_APP_VIZ_TEMPLATE)).toBe('low');
        expect(resolveClaudeEffort(9, DATA_APP_VIZ_TEMPLATE)).toBe('low');
    });
});

describe('payloadClaudeEffort', () => {
    it('uses what the enqueuer decided', () => {
        expect(
            payloadClaudeEffort(payload({ claudeEffort: 'low' }), 'dashboard'),
        ).toBe('low');
    });

    it('falls back to the app template for jobs enqueued before the field', () => {
        expect(payloadClaudeEffort(payload({}), DATA_APP_VIZ_TEMPLATE)).toBe(
            'low',
        );
        expect(payloadClaudeEffort(payload({}), 'dashboard')).toBe('high');
    });
});

describe('jobClaudeEffort', () => {
    it('uses the payload without fetching the template', async () => {
        const getTemplate = () => {
            throw new Error('should not be called');
        };

        await expect(
            jobClaudeEffort(payload({ claudeEffort: 'low' }), getTemplate),
        ).resolves.toBe('low');
    });

    // Only a generate payload carries `template`, so an iteration enqueued
    // before the field must fetch it or it reports `high` for a chart type
    // that actually ran low.
    it('fetches the template for a legacy iteration', async () => {
        await expect(
            jobClaudeEffort(payload({}), () =>
                Promise.resolve(DATA_APP_VIZ_TEMPLATE),
            ),
        ).resolves.toBe('low');

        await expect(
            jobClaudeEffort(payload({}), () => Promise.resolve('dashboard')),
        ).resolves.toBe('high');
    });

    it('falls back to the version policy when the template is unavailable', async () => {
        await expect(
            jobClaudeEffort(payload({}), () => Promise.resolve(null)),
        ).resolves.toBe('high');
    });
});
