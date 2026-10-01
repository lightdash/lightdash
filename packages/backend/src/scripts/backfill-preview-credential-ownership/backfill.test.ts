import {
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import { classifyPreviewOwnership } from './backfill';
import { parseArguments } from './cli';

const bigquerySso = (refreshToken: string): CreateBigqueryCredentials => ({
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.SSO,
    project: 'analytics',
    dataset: 'prod',
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
    keyfileContents: {
        type: 'authorized_user',
        client_id: 'lightdash-client',
        client_secret: 'secret',
        refresh_token: refreshToken,
    },
});

const postgres: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    user: 'analyst',
    password: 'password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};

describe('classifyPreviewOwnership', () => {
    test("a token equal to the parent's current token is a copy", () => {
        expect(
            classifyPreviewOwnership({
                previewCredentials: bigquerySso('token-a'),
                upstreamCredentials: bigquerySso('token-a'),
            }),
        ).toBe(false);
    });

    test('a different token is classified as owned', () => {
        expect(
            classifyPreviewOwnership({
                previewCredentials: bigquerySso('own-token'),
                upstreamCredentials: bigquerySso('token-a'),
            }),
        ).toBe(true);
    });

    test('a preview without readable parent credentials is classified as owned', () => {
        expect(
            classifyPreviewOwnership({
                previewCredentials: bigquerySso('token-a'),
                upstreamCredentials: null,
            }),
        ).toBe(true);
        expect(
            classifyPreviewOwnership({
                previewCredentials: bigquerySso('token-a'),
                upstreamCredentials: postgres,
            }),
        ).toBe(true);
    });

    test('a preview without BigQuery SSO is left unclassified', () => {
        expect(
            classifyPreviewOwnership({
                previewCredentials: postgres,
                upstreamCredentials: bigquerySso('token-a'),
            }),
        ).toBeNull();
    });
});

describe('parseArguments', () => {
    test('defaults to a dry run', () => {
        expect(parseArguments([])).toEqual({ execute: false, batchSize: 500 });
    });

    test('reads --execute and --batch-size', () => {
        expect(parseArguments(['--execute', '--batch-size', '50'])).toEqual({
            execute: true,
            batchSize: 50,
        });
    });

    test('rejects unknown arguments and bad batch sizes', () => {
        expect(() => parseArguments(['--force'])).toThrow(
            'Unknown argument: --force',
        );
        expect(() => parseArguments(['--batch-size', '0'])).toThrow(
            '--batch-size must be a positive integer',
        );
    });
});
