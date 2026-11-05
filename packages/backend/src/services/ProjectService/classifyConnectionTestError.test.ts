import {
    DbtError,
    ForbiddenError,
    InsufficientGitPermissionsError,
    NotFoundError,
    SnowflakeTokenError,
    TimeoutError,
    UnexpectedGitError,
    WarehouseConnectionError,
} from '@lightdash/common';
import { classifyConnectionTestError } from './classifyConnectionTestError';

const withCode = (code: string | number) =>
    Object.assign(new Error('raw driver message'), { code });

describe('classifyConnectionTestError', () => {
    test.each([
        [new DbtError('dbt failed'), 'dbt', 'dbt'],
        [new UnexpectedGitError('clone failed'), 'dbt', 'dbt'],
        [new InsufficientGitPermissionsError('no access'), 'dbt', 'permission'],
        [new SnowflakeTokenError('expired'), 'warehouse', 'authentication'],
        [new ForbiddenError(), 'warehouse', 'permission'],
        [new NotFoundError('missing'), 'warehouse', 'not_found'],
        [new TimeoutError('slow'), 'warehouse', 'timeout'],
        [withCode('ENOTFOUND'), 'warehouse', 'network'],
        [withCode('ETIMEDOUT'), 'warehouse', 'timeout'],
        [withCode('28P01'), 'warehouse', 'authentication'],
        [withCode('42501'), 'warehouse', 'permission'],
        [withCode('3D000'), 'warehouse', 'not_found'],
        [withCode(390100), 'warehouse', 'authentication'],
        [withCode('UNMAPPED'), 'warehouse', 'unknown'],
        [withCode('constructor'), 'warehouse', 'unknown'],
        [
            new WarehouseConnectionError('password authentication failed'),
            'warehouse',
            'unknown',
        ],
        ['not an error', 'warehouse', 'unknown'],
    ])('classifies %s', (error, stage, errorCategory) => {
        expect(classifyConnectionTestError(error)).toEqual({
            stage,
            errorCategory,
        });
    });

    test('reads the code from the error cause', () => {
        const error = new WarehouseConnectionError('Snowflake error');
        error.cause = withCode('ECONNREFUSED');
        expect(classifyConnectionTestError(error)).toEqual({
            stage: 'warehouse',
            errorCategory: 'network',
        });
    });
});
