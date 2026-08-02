import { AlreadyExistsError, NotFoundError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { DatabaseError } from 'pg';
import { RolesTableName } from '../database/entities/roles';
import { RolesModel } from './RolesModel';

const databaseError = (code: string): DatabaseError => {
    const error = new DatabaseError(`database error ${code}`, 0, 'error');
    error.code = code;
    return error;
};

const uniqueViolation = () => databaseError('23505');

describe('RolesModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new RolesModel(database);
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('createRole', () => {
        const roleData = {
            name: 'Copy of: Editor',
            description: null,
            level: 'organization' as const,
            created_by: 'user-uuid',
        };

        it('translates a unique-name violation into AlreadyExistsError', async () => {
            tracker.on
                .insert(RolesTableName)
                .simulateErrorOnce(uniqueViolation());

            await expect(
                model.createRole('org-uuid', roleData),
            ).rejects.toThrow(AlreadyExistsError);
        });

        it('names the conflicting role in the error message', async () => {
            tracker.on
                .insert(RolesTableName)
                .simulateErrorOnce(uniqueViolation());

            await expect(
                model.createRole('org-uuid', roleData),
            ).rejects.toThrow('A role named "Copy of: Editor" already exists');
        });

        it('rethrows non-unique database errors unchanged', async () => {
            const foreignKeyViolation = databaseError('23503');
            tracker.on
                .insert(RolesTableName)
                .simulateErrorOnce(foreignKeyViolation);

            await expect(model.createRole('org-uuid', roleData)).rejects.toBe(
                foreignKeyViolation,
            );
        });
    });

    describe('updateRole', () => {
        it('translates a unique-name violation into AlreadyExistsError', async () => {
            tracker.on
                .update(RolesTableName)
                .simulateErrorOnce(uniqueViolation());

            await expect(
                model.updateRole('role-uuid', { name: 'Copy of: Editor' }),
            ).rejects.toThrow(AlreadyExistsError);
        });

        it('rethrows non-unique database errors unchanged', async () => {
            const foreignKeyViolation = databaseError('23503');
            tracker.on
                .update(RolesTableName)
                .simulateErrorOnce(foreignKeyViolation);

            await expect(
                model.updateRole('role-uuid', { name: 'Copy of: Editor' }),
            ).rejects.toBe(foreignKeyViolation);
        });

        it('throws NotFoundError when the role does not exist', async () => {
            tracker.on.update(RolesTableName).responseOnce([]);

            await expect(
                model.updateRole('missing-uuid', { description: 'x' }),
            ).rejects.toThrow(NotFoundError);
        });
    });
});
