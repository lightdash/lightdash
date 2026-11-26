import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getSupabaseTestRequest,
    toSupabaseCreatePayload,
    toSupabaseOrigin,
} from './supabaseConnection';

describe('supabaseConnection', () => {
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
                name: ' Orders ',
                projectUrl: 'https://abcd.supabase.co/',
                table: ' orders ',
                secret: ' sb_secret_x ',
            }),
        ).toMatchObject({
            name: 'Orders',
            type: 'api_key',
            origin: 'https://abcd.supabase.co',
            apiKeyName: 'apikey',
            apiKeyLocation: 'header',
            secret: 'sb_secret_x',
            apiSource: {
                connector: ApiConnectorType.SUPABASE,
                table: 'orders',
            },
            allowedMethods: ['GET'],
            allowedPathPrefixes: ['/rest/v1/'],
        });
    });

    it('tests by reading one row of the table', () => {
        expect(getSupabaseTestRequest(' orders ')).toEqual({
            method: 'GET',
            path: '/rest/v1/orders',
            query: { select: '*', limit: '1' },
        });
    });
});
