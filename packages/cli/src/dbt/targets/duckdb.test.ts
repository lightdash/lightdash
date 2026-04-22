import { ParseError, WarehouseTypes } from '@lightdash/common';
import { convertDuckdbSchema } from './duckdb';

describe('convertDuckdbSchema', () => {
    test('should parse MotherDuck duckdb targets', () => {
        expect(
            convertDuckdbSchema({
                type: 'duckdb',
                path: 'md:analytics',
                schema: 'main',
                threads: 4,
                settings: {
                    motherduck_token: 'motherduck_token',
                },
            }),
        ).toEqual({
            type: WarehouseTypes.DUCKDB,
            database: 'analytics',
            schema: 'main',
            token: 'motherduck_token',
            threads: 4,
        });
    });

    test('should reject non-MotherDuck duckdb targets', () => {
        expect(() =>
            convertDuckdbSchema({
                type: 'duckdb',
                path: 'analytics.duckdb',
                schema: 'main',
            }),
        ).toThrow(ParseError);
    });

    test('should require a MotherDuck token', () => {
        expect(() =>
            convertDuckdbSchema({
                type: 'duckdb',
                path: 'md:analytics',
                schema: 'main',
            }),
        ).toThrow(ParseError);
    });
});
