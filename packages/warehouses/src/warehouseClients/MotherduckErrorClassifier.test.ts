import { classifyMotherduckError } from './MotherduckErrorClassifier';

describe('classifyMotherduckError', () => {
    it.each([
        'Connection Error: Connection has already been closed',
        'Invalid Input Error: Cannot execute statement of closed connection',
        'Catalog Error: Database analytics was detached',
        'Invalid Input Error: database was invalidated because the instance was closed',
    ])('classifies stale DuckDB handles: %s', (message) => {
        expect(classifyMotherduckError(new Error(message))).toBe('stale');
    });

    it.each([
        'MotherDuck Authentication failed: token rejected',
        'Invalid Input Error: MD Authentication Error: Invalid token',
        'Your request is not authenticated. Please check your MotherDuck token...',
        'HTTP Error: Unauthorized',
        "Could not connect to MotherDuck... (PERMISSION_DENIED, RPC 'CREATE_SLT')",
        'RPC failed with PeRmIsSiOn_DeNiEd',
        'COULD NOT CONNECT TO MOTHERDUCK',
    ])('classifies MotherDuck authentication failures: %s', (message) => {
        expect(classifyMotherduckError(new Error(message))).toBe('auth');
    });

    it.each([
        'Binder Error: Referenced column missing_column not found',
        'Catalog Error: Table with name missing_table does not exist',
        'Invalid Input Error: configuration has been locked',
    ])('leaves SQL and configuration errors untouched: %s', (message) => {
        expect(classifyMotherduckError(new Error(message))).toBe('other');
    });
});
