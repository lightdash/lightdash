import {
    DATA_APP_VIZ_TEMPLATE,
    type AppGeneratePipelineJobPayload,
    type DataAppClaudeEffort,
    type DataAppTemplate,
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

/** The private instance resolver, run against a minimal stub so the app-row
 *  fallback is covered without constructing the whole service. */
const resolveJobEffort = (
    job: AppGeneratePipelineJobPayload,
    getApp: () => Promise<{ template: DataAppTemplate | null }>,
): Promise<DataAppClaudeEffort> =>
    // eslint-disable-next-line @typescript-eslint/dot-notation
    AppGenerateService.prototype['resolveJobClaudeEffort'].call(
        {
            appModel: { getApp },
            logger: { warn: () => {} },
        } as unknown as AppGenerateService,
        job,
    );

describe('resolveClaudeEffort', () => {
    it('runs first builds low', () => {
        expect(resolveEffort(1, 'dashboard')).toBe('low');
        expect(resolveEffort(1, null)).toBe('low');
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

describe('resolveJobClaudeEffort', () => {
    it('uses the payload without reading the app row', async () => {
        const getApp = () => {
            throw new Error('should not be called');
        };
        await expect(
            resolveJobEffort(payload({ claudeEffort: 'low' }), getApp),
        ).resolves.toBe('low');
    });

    // Only a generate payload ever carries `template`, so an iteration job
    // enqueued before the field must read the app row or it reports `high`
    // for a chart type that actually ran low.
    it('reads the template from the app row for a legacy iteration', async () => {
        await expect(
            resolveJobEffort(payload({}), () =>
                Promise.resolve({ template: DATA_APP_VIZ_TEMPLATE }),
            ),
        ).resolves.toBe('low');

        await expect(
            resolveJobEffort(payload({}), () =>
                Promise.resolve({ template: 'dashboard' }),
            ),
        ).resolves.toBe('high');
    });

    it('falls back to the version policy when the app row is unreadable', async () => {
        await expect(
            resolveJobEffort(payload({}), () =>
                Promise.reject(new Error('App not found')),
            ),
        ).resolves.toBe('high');
    });
});
