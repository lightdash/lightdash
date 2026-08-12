import {
    DATA_APP_VIZ_TEMPLATE,
    type AppGeneratePipelineJobPayload,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { AppGenerateService } from './AppGenerateService';

// Private statics — accessed via index so the effort policy stays covered
// without widening the service's public surface.
// eslint-disable-next-line @typescript-eslint/dot-notation
const resolveEffort = AppGenerateService['resolveClaudeEffort'];
// eslint-disable-next-line @typescript-eslint/dot-notation
const payloadEffort = AppGenerateService['payloadClaudeEffort'];

const payload = (
    overrides: Partial<AppGeneratePipelineJobPayload>,
): AppGeneratePipelineJobPayload =>
    ({
        appUuid: 'app-uuid',
        version: 2,
        projectUuid: 'project-uuid',
        organizationUuid: 'org-uuid',
        userUuid: 'user-uuid',
        prompt: 'make it horizontal',
        isIteration: true,
        ...overrides,
    }) as AppGeneratePipelineJobPayload;

describe('resolveClaudeEffort', () => {
    it('runs first builds low', () => {
        expect(resolveEffort(1, 'dashboard')).toBe('low');
        expect(resolveEffort(1, undefined)).toBe('low');
    });

    it('runs data app iterations high', () => {
        expect(resolveEffort(2, 'dashboard')).toBe('high');
        expect(resolveEffort(7, null)).toBe('high');
    });

    it('runs chart type iterations low', () => {
        expect(resolveEffort(1, DATA_APP_VIZ_TEMPLATE)).toBe('low');
        expect(resolveEffort(2, DATA_APP_VIZ_TEMPLATE)).toBe('low');
        expect(resolveEffort(9, DATA_APP_VIZ_TEMPLATE)).toBe('low');
    });
});

describe('payloadClaudeEffort', () => {
    it('uses what the enqueuer decided', () => {
        expect(
            payloadEffort(payload({ claudeEffort: 'low' }), 'dashboard'),
        ).toBe('low');
    });

    it('falls back to the app template for jobs enqueued before the field', () => {
        expect(payloadEffort(payload({}), DATA_APP_VIZ_TEMPLATE)).toBe('low');
        expect(payloadEffort(payload({}), 'dashboard')).toBe('high');
    });
});
