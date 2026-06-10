import { NotFoundError } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { OrganizationDesignFilesTableName } from '../database/entities/organizationDesignFiles';
import { OrganizationDesignsTableName } from '../database/entities/organizationDesigns';
import { OrganizationDesignModel } from './OrganizationDesignModel';

// These tests intentionally cover only behaviors the model has beyond a
// thin Knex wrapper — transactional ordering, idempotency, and the
// NotFoundError contracts the service layer depends on. Pure CRUD
// happy-paths (insert+returning, select-by-uuid, snake↔camel mapping) are
// excluded per the project's "don't test implementation details" rule.

const ORG_UUID = '00000000-0000-0000-0000-000000000001';
const USER_UUID = '00000000-0000-0000-0000-000000000002';
const DESIGN_UUID = '00000000-0000-0000-0000-000000000010';
const FILE_UUID = '00000000-0000-0000-0000-000000000100';

const makeDbDesign = (overrides: Partial<Record<string, unknown>> = {}) => ({
    design_uuid: DESIGN_UUID,
    organization_uuid: ORG_UUID,
    name: 'Brand A',
    description: 'Acme brand',
    is_default: false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    created_by_user_uuid: USER_UUID,
    ...overrides,
});

const makeDbFile = (overrides: Partial<Record<string, unknown>> = {}) => ({
    file_uuid: FILE_UUID,
    design_uuid: DESIGN_UUID,
    kind: 'css',
    filename: 'theme.css',
    content_type: 'text/css',
    size_bytes: 1234,
    created_at: new Date('2026-01-03T00:00:00Z'),
    created_by_user_uuid: USER_UUID,
    ...overrides,
});

describe('OrganizationDesignModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OrganizationDesignModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('update', () => {
        it('throws NotFoundError when no row is updated', async () => {
            tracker.on.update(OrganizationDesignsTableName).responseOnce([]);

            await expect(
                model.update(ORG_UUID, DESIGN_UUID, { name: 'Renamed' }),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('delete', () => {
        it('throws NotFoundError when no row matched', async () => {
            tracker.on.delete(OrganizationDesignsTableName).responseOnce(0);

            await expect(model.delete(ORG_UUID, DESIGN_UUID)).rejects.toThrow(
                NotFoundError,
            );
        });
    });

    describe('clearDefault', () => {
        it('issues an UPDATE scoped to the org and is_default=true', async () => {
            tracker.on.update(OrganizationDesignsTableName).responseOnce(1);

            await expect(model.clearDefault(ORG_UUID)).resolves.toBeUndefined();

            expect(tracker.history.update).toHaveLength(1);
            const { bindings, sql } = tracker.history.update[0];
            // Scoped to this org and to currently-default rows only.
            expect(bindings).toEqual(expect.arrayContaining([ORG_UUID]));
            expect(bindings).toEqual(expect.arrayContaining([true]));
            // Sets is_default=false.
            expect(bindings).toEqual(expect.arrayContaining([false]));
            expect(sql).toContain(OrganizationDesignsTableName);
        });

        it('is idempotent when no row is currently default', async () => {
            tracker.on.update(OrganizationDesignsTableName).responseOnce(0);

            await expect(model.clearDefault(ORG_UUID)).resolves.toBeUndefined();
        });
    });

    describe('setDefault', () => {
        it('clears the existing default before promoting the new one', async () => {
            // The partial unique index `organization_designs_one_default_per_org`
            // rejects two rows being default at once. A naive "set new, then
            // clear old" would fail at runtime. This test pins the safe order.
            const targetRow = makeDbDesign();
            const promotedRow = makeDbDesign({ is_default: true });

            tracker.on
                .select(OrganizationDesignsTableName)
                .responseOnce(targetRow);
            tracker.on
                .update(OrganizationDesignsTableName)
                .response((query) => {
                    if (/is_default.*=.*\$/.test(query.sql)) {
                        // Either the clear or the set; the second update has
                        // a `returning *` clause.
                        if (/returning/i.test(query.sql)) {
                            return [promotedRow];
                        }
                        return 1;
                    }
                    return 1;
                });
            tracker.on
                .select(OrganizationDesignFilesTableName)
                .responseOnce([]);

            const result = await model.setDefault(ORG_UUID, DESIGN_UUID);

            expect(result.isDefault).toBe(true);
            expect(tracker.history.update).toHaveLength(2);
            const clearIdx = tracker.history.update.findIndex((u) =>
                u.bindings.includes(false),
            );
            const setIdx = tracker.history.update.findIndex(
                (u) => u.bindings.includes(true) && !u.bindings.includes(false),
            );
            expect(clearIdx).toBeGreaterThan(-1);
            expect(setIdx).toBeGreaterThan(-1);
            expect(clearIdx).toBeLessThan(setIdx);
        });

        it('throws NotFoundError when target design does not exist', async () => {
            tracker.on
                .select(OrganizationDesignsTableName)
                .responseOnce(undefined);

            await expect(
                model.setDefault(ORG_UUID, DESIGN_UUID),
            ).rejects.toThrow(NotFoundError);
            // No update fires when the lookup fails — important because the
            // setDefault transaction would otherwise clear a real default
            // row before discovering the target is missing.
            expect(tracker.history.update).toHaveLength(0);
        });
    });

    describe('addFile', () => {
        it('bumps the parent design updated_at in the same transaction as the file insert', async () => {
            // The parent bump is a behavioral guarantee callers rely on for
            // "modified at" displays. Easy to drop in a future refactor.
            const fileRow = makeDbFile();
            tracker.on
                .insert(OrganizationDesignFilesTableName)
                .responseOnce([fileRow]);
            tracker.on.update(OrganizationDesignsTableName).responseOnce(1);

            await model.addFile(DESIGN_UUID, USER_UUID, {
                fileUuid: FILE_UUID,
                kind: 'css',
                filename: 'theme.css',
                contentType: 'text/css',
                sizeBytes: 1234,
            });

            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.update).toHaveLength(1);
            expect(tracker.history.update[0].sql).toContain(
                OrganizationDesignsTableName,
            );
        });
    });

    describe('removeFile', () => {
        it('bumps the parent design updated_at on successful delete', async () => {
            const fileRow = makeDbFile();
            tracker.on
                .delete(OrganizationDesignFilesTableName)
                .responseOnce([fileRow]);
            tracker.on.update(OrganizationDesignsTableName).responseOnce(1);

            await model.removeFile(DESIGN_UUID, FILE_UUID);

            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.update).toHaveLength(1);
        });

        it('throws NotFoundError and skips the parent bump when no file was deleted', async () => {
            // The parent bump must NOT fire on a missing-file path — otherwise
            // the design row's updated_at gets touched for no-op deletes.
            tracker.on
                .delete(OrganizationDesignFilesTableName)
                .responseOnce([]);

            await expect(
                model.removeFile(DESIGN_UUID, FILE_UUID),
            ).rejects.toThrow(NotFoundError);
            expect(tracker.history.update).toHaveLength(0);
        });
    });
});
