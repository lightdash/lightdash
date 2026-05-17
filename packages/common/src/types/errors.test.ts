import {
    ForbiddenError,
    LightdashError,
    MissingConfigError,
    NotFoundError,
    reconstructLightdashError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from './errors';

describe('reconstructLightdashError', () => {
    // Pairs the QueryHistoryModel.poll fix: errors stored in
    // query_history.error + query_history.error_name must be rehydrated
    // as their original LightdashError subclass, so the scheduler's
    // instanceof check in shouldDisableSync still works after a round-trip
    // through the database.
    it.each([
        ['WarehouseQueryError', WarehouseQueryError],
        ['WarehouseConnectionError', WarehouseConnectionError],
        ['NotFoundError', NotFoundError],
        ['ForbiddenError', ForbiddenError],
        ['MissingConfigError', MissingConfigError],
    ])('reconstructs %s as the original class', (name, ClassRef) => {
        const message = 'something went wrong';
        const err = reconstructLightdashError(name, message);
        expect(err).toBeInstanceOf(ClassRef);
        expect(err).toBeInstanceOf(LightdashError);
        expect(err.message).toBe(message);
        expect(err.name).toBe(name);
    });

    it('falls back to plain Error when name is null', () => {
        const err = reconstructLightdashError(null, 'plain message');
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(LightdashError);
        expect(err.message).toBe('plain message');
    });

    it('falls back to plain Error when name is unknown', () => {
        // Robustness: an error class that has been removed or renamed
        // since the row was written must not throw — fall back gracefully.
        const err = reconstructLightdashError(
            'SomeRemovedErrorClass',
            'message',
        );
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(LightdashError);
        expect(err.message).toBe('message');
    });

    it('preserves the original BigQuery notFound message shape', () => {
        // Matches the shape emitted by BigqueryWarehouseClient.parseError
        // when a referenced table no longer exists in the warehouse.
        const message =
            'Bigquery warehouse error: notFound - Not found: Table my-project:my_dataset.my_table was not found in location us-central1';
        const err = reconstructLightdashError('WarehouseQueryError', message);
        expect(err).toBeInstanceOf(WarehouseQueryError);
        expect(err.message).toBe(message);
    });
});
