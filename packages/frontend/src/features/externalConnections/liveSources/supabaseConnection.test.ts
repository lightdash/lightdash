import { ApiConnectorType, getSupabaseKeyError } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    SUPABASE_TEST_REQUEST,
    toSupabaseCreatePayload,
    toSupabaseOrigin,
} from './supabaseConnection';

describe('supabaseConnection', () => {
    it('takes only sb_secret_ keys', () => {
        expect(getSupabaseKeyError(' sb_secret_x ')).toBeUndefined();
        expect(getSupabaseKeyError('eyJhbGciOi.x.y')).toMatch(/no rows/);
        expect(getSupabaseKeyError('sb_publishable_x')).toMatch(/secret key/);
        expect(getSupabaseKeyError('')).toMatch(/sb_secret_/);
    });

    it('reads the project origin from a URL or a project ref', () => {
        expect(toSupabaseOrigin(' https://abcd.supabase.co/rest/v1/ ')).toBe(
            'https://abcd.supabase.co',
        );
        expect(toSupabaseOrigin('abcdefghijklmnopqrst')).toBe(
            'https://abcdefghijklmnopqrst.supabase.co',
        );
    });

    it('creates a read-only source with the key on the apikey header', () => {
        expect(
            toSupabaseCreatePayload({
                name: ' Shop ',
                projectUrl: 'https://abcd.supabase.co/',
                secret: ' sb_secret_x ',
            }),
        ).toMatchObject({
            name: 'Shop',
            type: 'api_key',
            origin: 'https://abcd.supabase.co',
            apiKeyName: 'apikey',
            apiKeyLocation: 'header',
            secret: 'sb_secret_x',
            apiSource: {
                connector: ApiConnectorType.SUPABASE,
            },
            allowedMethods: ['GET'],
            allowedPathPrefixes: ['/rest/v1/'],
        });
    });

    it('tests by reading the table list', () => {
        expect(SUPABASE_TEST_REQUEST).toEqual({
            method: 'GET',
            path: '/rest/v1/',
        });
    });
});
