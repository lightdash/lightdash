import { type AppVersionResources } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type DbAppActivityRow } from '../../../database/entities/apps';
import { AppGenerateService } from './AppGenerateService';

// Private static — accessed via index so the row→event contract stays covered
// without widening the service's public surface.
const toEvent = (row: DbAppActivityRow) =>
    // eslint-disable-next-line @typescript-eslint/dot-notation
    AppGenerateService['toActivityEvent'](row);

const resources = (
    overrides: Partial<AppVersionResources> = {},
): AppVersionResources => ({
    images: [],
    charts: [],
    dashboardName: null,
    clarifications: [],
    ...overrides,
});

const row = (overrides: Partial<DbAppActivityRow> = {}): DbAppActivityRow => ({
    app_id: 'app-1',
    version: 1,
    prompt: 'Build me a sales dashboard',
    status: 'ready',
    resources: resources({ claudeModel: 'opus' }),
    created_at: new Date('2026-07-29T10:00:00Z'),
    created_by_user_uuid: 'user-1',
    app_name: 'Sales dashboard',
    app_deleted_at: null,
    project_uuid: 'project-1',
    project_name: 'Jaffle shop',
    created_by_user_first_name: 'Ada',
    created_by_user_last_name: 'Lovelace',
    ...overrides,
});

describe('toActivityEvent', () => {
    it('falls back to the default model when the version predates the model picker', () => {
        expect(toEvent(row({ resources: null })).claudeModel).toBe('sonnet');
        expect(toEvent(row({ resources: resources() })).claudeModel).toBe(
            'sonnet',
        );
        expect(toEvent(row()).claudeModel).toBe('opus');
    });

    it('keeps generations of deleted apps, flagged as deleted', () => {
        expect(toEvent(row()).appDeleted).toBe(false);
        expect(
            toEvent(row({ app_deleted_at: new Date('2026-07-29T12:00:00Z') }))
                .appDeleted,
        ).toBe(true);
    });

    it('collapses a hard-deleted author to a null user', () => {
        expect(
            toEvent(
                row({
                    created_by_user_first_name: null,
                    created_by_user_last_name: null,
                }),
            ).user,
        ).toBeNull();
        expect(toEvent(row()).user).toEqual({
            userUuid: 'user-1',
            firstName: 'Ada',
            lastName: 'Lovelace',
        });
    });
});
