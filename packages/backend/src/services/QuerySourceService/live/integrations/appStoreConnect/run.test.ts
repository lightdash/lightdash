import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { appStoreConnectIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { APP_STORE_CONNECT_MAX_QUERY_ROWS } from './run';

const APP_ID = '1234567890';
const SETTINGS = {
    connector: ApiConnectorType.APP_STORE_CONNECT,
    appId: APP_ID,
} as const;
const ORIGIN = 'https://api.appstoreconnect.apple.com';

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(appStoreConnectIntegration, SETTINGS, send),
    };
};

const version = (id: number, overrides: Record<string, unknown> = {}) => ({
    type: 'appStoreVersions',
    id: `version-${id}`,
    attributes: {
        platform: 'IOS',
        versionString: `1.0.${id}`,
        appVersionState: 'READY_FOR_DISTRIBUTION',
        releaseType: 'AFTER_APPROVAL',
        earliestReleaseDate: null,
        downloadable: true,
        createdDate: '2026-11-23T02:58:24-08:00',
        ...overrides,
    },
});

const list = (
    resource: string,
    data: unknown[],
    { total, nextCursor }: { total: number; nextCursor?: string },
) =>
    response({
        data,
        links: {
            self: `${ORIGIN}/v1/apps/${APP_ID}/${resource}?limit=2`,
            ...(nextCursor
                ? {
                      next: `${ORIGIN}/v1/apps/${APP_ID}/${resource}?cursor=${nextCursor}&limit=2`,
                  }
                : {}),
        },
        meta: {
            paging: {
                total,
                limit: data.length || 1,
                ...(nextCursor ? { nextCursor } : {}),
            },
        },
    });

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) => source.run({ query: JSON.stringify(request), limit });

const versionsPath = `/v1/apps/${APP_ID}/appStoreVersions`;

describe('appStoreConnectIntegration lists', () => {
    it('lists versions with a sparse fieldset and filters, typing each column', async () => {
        const { source, send } = connect(
            list('appStoreVersions', [version(7)], { total: 1 }),
        );

        const result = await run(source, {
            resource: 'appStoreVersions',
            fields: [
                'id',
                'versionString',
                'createdDate',
                'earliestReleaseDate',
                'downloadable',
            ],
            filters: { platform: ['IOS'], appVersionState: ['IN_REVIEW'] },
        });

        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: versionsPath,
            query: {
                'fields[appStoreVersions]':
                    'versionString,createdDate,earliestReleaseDate,downloadable',
                'filter[platform]': 'IOS',
                'filter[appVersionState]': 'IN_REVIEW',
                limit: '11',
            },
            body: undefined,
        });
        expect(result.columns).toEqual([
            { name: 'id', type: 'string' },
            { name: 'versionString', type: 'string' },
            { name: 'createdDate', type: 'timestamp' },
            { name: 'earliestReleaseDate', type: 'timestamp' },
            { name: 'downloadable', type: 'boolean' },
        ]);
        expect(result.rows).toEqual([
            {
                id: 'version-7',
                versionString: '1.0.7',
                createdDate: '2026-11-23T10:58:24.000Z',
                earliestReleaseDate: null,
                downloadable: true,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('lists builds by their build number', async () => {
        const { source, send } = connect(
            list(
                'builds',
                [
                    {
                        type: 'builds',
                        id: 'build-1',
                        attributes: {
                            version: '42',
                            processingState: 'VALID',
                            expired: false,
                        },
                    },
                ],
                { total: 1 },
            ),
        );

        const result = await run(source, {
            resource: 'builds',
            fields: ['version', 'processingState', 'expired'],
        });

        expect(send.mock.calls[0][0]).toMatchObject({
            path: `/v1/apps/${APP_ID}/builds`,
            query: {
                'fields[builds]': 'version,processingState,expired',
                limit: '11',
            },
        });
        expect(result.rows).toEqual([
            { version: '42', processingState: 'VALID', expired: false },
        ]);
    });

    it('sends several values of a filter comma separated, with the native review sort', async () => {
        const { source, send } = connect(
            list(
                'customerReviews',
                [
                    {
                        type: 'customerReviews',
                        id: 'review-1',
                        attributes: {
                            rating: 1,
                            title: 'Crashes',
                            territory: 'GBR',
                        },
                    },
                ],
                { total: 1 },
            ),
        );

        const result = await run(source, {
            resource: 'customerReviews',
            fields: ['rating', 'title', 'territory'],
            filters: { rating: ['1', '2'] },
            sort: '-createdDate',
        });

        expect(send.mock.calls[0][0].query).toEqual({
            'fields[customerReviews]': 'rating,title,territory',
            'filter[rating]': '1,2',
            sort: '-createdDate',
            limit: '11',
        });
        expect(result.columns[0]).toEqual({ name: 'rating', type: 'number' });
        expect(result.rows).toEqual([
            { rating: 1, title: 'Crashes', territory: 'GBR' },
        ]);
    });

    it('lists review submissions', async () => {
        const { source, send } = connect(
            list(
                'reviewSubmissions',
                [
                    {
                        type: 'reviewSubmissions',
                        id: 'submission-1',
                        attributes: {
                            platform: 'IOS',
                            state: 'COMPLETE',
                            submittedDate: '2026-11-20T09:00:00Z',
                        },
                    },
                ],
                { total: 1 },
            ),
        );

        const result = await run(source, {
            resource: 'reviewSubmissions',
            fields: ['id', 'state', 'submittedDate'],
            filters: { state: ['COMPLETE'] },
        });

        expect(send.mock.calls[0][0]).toMatchObject({
            path: `/v1/apps/${APP_ID}/reviewSubmissions`,
            query: {
                'fields[reviewSubmissions]': 'state,submittedDate',
                'filter[state]': 'COMPLETE',
            },
        });
        expect(result.rows).toEqual([
            {
                id: 'submission-1',
                state: 'COMPLETE',
                submittedDate: '2026-11-20T09:00:00.000Z',
            },
        ]);
    });

    it('asks for one cheap attribute when only the ID is selected', async () => {
        const { source, send } = connect(
            list('appStoreVersions', [version(1)], { total: 1 }),
        );

        const result = await run(source, {
            resource: 'appStoreVersions',
            fields: ['id'],
        });

        expect(send.mock.calls[0][0].query).toEqual({
            'fields[appStoreVersions]': 'versionString',
            limit: '11',
        });
        expect(result.rows).toEqual([{ id: 'version-1' }]);
    });

    it('follows the cursor until the last page', async () => {
        const page = (from: number, count: number) =>
            Array.from({ length: count }, (_, i) => version(from + i));
        const { source, send } = connect(
            list('appStoreVersions', page(1, 200), {
                total: 450,
                nextCursor: 'Ag',
            }),
            list('appStoreVersions', page(201, 200), {
                total: 450,
                nextCursor: 'Bg',
            }),
            list('appStoreVersions', page(401, 50), { total: 450 }),
        );

        const result = await run(
            source,
            { resource: 'appStoreVersions', fields: ['versionString'] },
            1_000,
        );

        expect(send).toHaveBeenCalledTimes(3);
        expect(send.mock.calls.map(([request]) => request.query)).toEqual([
            { 'fields[appStoreVersions]': 'versionString', limit: '200' },
            {
                'fields[appStoreVersions]': 'versionString',
                limit: '200',
                cursor: 'Ag',
            },
            {
                'fields[appStoreVersions]': 'versionString',
                limit: '200',
                cursor: 'Bg',
            },
        ]);
        expect(result.rows).toHaveLength(450);
        expect(result.hasMoreRows).toBe(false);
    });

    it('stops one row past the limit and says there are more', async () => {
        const { source, send } = connect(
            list(
                'appStoreVersions',
                Array.from({ length: 6 }, (_, i) => version(i)),
                { total: 300, nextCursor: 'Ag' },
            ),
        );

        const result = await run(
            source,
            {
                resource: 'appStoreVersions',
                fields: ['versionString'],
                rowLimit: 5,
            },
            50,
        );

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].query.limit).toBe('6');
        expect(result.rows).toHaveLength(5);
        expect(result.hasMoreRows).toBe(true);
    });

    it('reads an empty list as no rows', async () => {
        const { source } = connect(list('appStoreVersions', [], { total: 0 }));

        const result = await run(source, {
            resource: 'appStoreVersions',
            fields: ['versionString'],
        });

        expect(result.rows).toEqual([]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('refuses more rows than one query can read, before calling', async () => {
        const { source, send } = connect();

        await expect(
            run(
                source,
                { resource: 'appStoreVersions', fields: ['versionString'] },
                APP_STORE_CONNECT_MAX_QUERY_ROWS + 1,
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('reads at most every page it may, saying there are more rows', async () => {
        const responses = Array.from({ length: 25 }, (_, page) =>
            list(
                'appStoreVersions',
                Array.from({ length: 200 }, (__, i) => version(page * 200 + i)),
                { total: 9_000, nextCursor: `cursor-${page}` },
            ),
        );
        const { source, send } = connect(...responses);

        const result = await run(
            source,
            { resource: 'appStoreVersions', fields: ['versionString'] },
            APP_STORE_CONNECT_MAX_QUERY_ROWS,
        );

        expect(send).toHaveBeenCalledTimes(25);
        expect(result.rows).toHaveLength(APP_STORE_CONNECT_MAX_QUERY_ROWS);
        expect(result.hasMoreRows).toBe(true);
    });

    it('fails on an unexpected response shape', async () => {
        const { source } = connect(response({ data: 'nope' }));

        await expect(
            run(source, {
                resource: 'appStoreVersions',
                fields: ['versionString'],
            }),
        ).rejects.toBeInstanceOf(UnexpectedServerError);
    });
});

describe('appStoreConnectIntegration counts', () => {
    it('counts with one call of one record, reading the total', async () => {
        const { source, send } = connect(
            list('customerReviews', [{ type: 'customerReviews', id: 'r' }], {
                total: 42,
            }),
        );

        const result = await run(source, {
            resource: 'customerReviews',
            fields: [],
            filters: { territory: ['USA'] },
            count: true,
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: `/v1/apps/${APP_ID}/customerReviews`,
            query: {
                'fields[customerReviews]': 'rating',
                'filter[territory]': 'USA',
                limit: '1',
            },
            body: undefined,
        });
        expect(result.columns).toEqual([{ name: 'total', type: 'number' }]);
        expect(result.rows).toEqual([{ total: 42 }]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('counts an empty list as 0', async () => {
        const { source } = connect(list('builds', [], { total: 0 }));

        const result = await run(source, {
            resource: 'builds',
            fields: [],
            count: true,
        });

        expect(result.rows).toEqual([{ total: 0 }]);
    });
});

describe('appStoreConnectIntegration request parsing', () => {
    it.each([
        [{ resource: 'apps', fields: ['name'] }, /resource/],
        [
            { resource: 'builds', fields: ['versionString'] },
            'builds has no field "versionString"',
        ],
        [
            {
                resource: 'builds',
                fields: ['version'],
                filters: { version: ['1'] },
            },
            "builds can't be filtered",
        ],
        [
            {
                resource: 'customerReviews',
                fields: ['rating'],
                filters: { title: ['great'] },
            },
            'customerReviews can\'t be filtered by "title"; use one of: rating, territory',
        ],
        [
            {
                resource: 'customerReviews',
                fields: ['rating'],
                sort: 'territory',
            },
            'customerReviews can\'t be sorted by "territory"; use one of: rating, -rating, createdDate, -createdDate',
        ],
        [
            {
                resource: 'appStoreVersions',
                fields: ['versionString'],
                sort: '-createdDate',
            },
            "appStoreVersions can't be sorted by App Store Connect",
        ],
        [
            {
                resource: 'appStoreVersions',
                fields: ['versionString'],
                filters: { versionString: ['1,2'] },
            },
            "App Store Connect can't filter on a value that contains a comma.",
        ],
        [{ resource: 'appStoreVersions', fields: [] }, /at least one field/],
        [
            { resource: 'appStoreVersions', fields: ['id'], include: 'app' },
            /include/,
        ],
    ])('refuses %j before calling', async (request, message) => {
        const { source, send } = connect();

        await expect(run(source, request)).rejects.toThrow(message);
        await expect(run(source, request)).rejects.toBeInstanceOf(
            ParameterError,
        );
        expect(send).not.toHaveBeenCalled();
    });
});

describe('appStoreConnectIntegration errors', () => {
    const count = {
        resource: 'appStoreVersions',
        fields: [],
        count: true,
    };
    const appleError = (status: string, code: string, detail: string) => ({
        errors: [{ status, code, title: 'Error', detail }],
    });

    it('explains a key App Store Connect rejects', async () => {
        const { source } = connect(
            response(appleError('401', 'NOT_AUTHORIZED', 'Bad token.'), 401),
        );
        const error = await run(source, count).catch((caught) => caught);
        expect(error).toBeInstanceOf(WarehouseConnectionError);
        expect(error.message).toBe(
            "App Store Connect didn't accept the API key. Check the key ID, the issuer ID and the private key, and that the key is still active.",
        );
    });

    it("explains a key whose role can't read the data", async () => {
        const { source } = connect(
            response(
                appleError(
                    '403',
                    'FORBIDDEN_ERROR',
                    'The API key in use does not allow this request',
                ),
                403,
            ),
        );
        const error = await run(source, count).catch((caught) => caught);
        expect(error).toBeInstanceOf(WarehouseConnectionError);
        expect(error.message).toBe(
            "This App Store Connect API key's role can't read this data: The API key in use does not allow this request. Use a key whose role can, then add the source again.",
        );
    });

    it('explains an app App Store Connect cannot find', async () => {
        const { source } = connect(
            response(appleError('404', 'NOT_FOUND', 'Not found.'), 404),
        );
        await expect(run(source, count)).rejects.toThrow(
            `App Store Connect could not find app ${APP_ID}. Check the app ID and that the key can see the app.`,
        );
    });

    it('reports the hourly limit with when to retry', async () => {
        const { source } = connect(
            response(
                appleError('429', 'RATE_LIMIT_EXCEEDED', 'Too many.'),
                429,
                { 'retry-after': '60' },
            ),
        );
        await expect(run(source, count)).rejects.toMatchObject({
            constructor: TooManyRequestsError,
            message:
                "App Store Connect's hourly request limit for this API key is used up. Retry later.",
            data: { retryAfterSeconds: 60 },
        });
    });

    it('reports the hourly limit without a retry time when none is sent', async () => {
        const { source } = connect(
            response(
                appleError('429', 'RATE_LIMIT_EXCEEDED', 'Too many.'),
                429,
            ),
        );
        await expect(run(source, count)).rejects.toMatchObject({
            data: { retryAfterSeconds: null },
        });
    });

    it('explains a rejected request with Apple’s detail', async () => {
        const { source } = connect(
            response(
                appleError(
                    '400',
                    'PARAMETER_ERROR.ILLEGAL',
                    "The parameter 'sort' can not be used with this request",
                ),
                400,
            ),
        );
        const error = await run(source, count).catch((caught) => caught);
        expect(error).toBeInstanceOf(WarehouseQueryError);
        expect(error.message).toBe(
            "App Store Connect rejected the request: The parameter 'sort' can not be used with this request",
        );
    });

    it('reports any other status as unexpected', async () => {
        const { source } = connect(response('Bad gateway', 502));
        await expect(run(source, count)).rejects.toBeInstanceOf(
            UnexpectedServerError,
        );
    });
});

describe('appStoreConnectIntegration setup', () => {
    it('summarizes the setup test with the latest version', () => {
        expect(
            appStoreConnectIntegration.summarizeTest?.(
                {
                    data: [
                        {
                            type: 'appStoreVersions',
                            id: 'version-1',
                            attributes: {
                                versionString: '1.0.7',
                                appVersionState: 'READY_FOR_DISTRIBUTION',
                            },
                        },
                    ],
                    meta: { paging: { total: 1204, limit: 1 } },
                },
                SETTINGS,
            ),
        ).toEqual({
            summary: `Connected to app ${APP_ID}`,
            facts: [
                { label: 'App Store versions', value: '1,204' },
                {
                    label: 'Latest version',
                    value: '1.0.7 (READY_FOR_DISTRIBUTION)',
                },
            ],
        });
    });

    it('summarizes an app with no versions yet', () => {
        expect(
            appStoreConnectIntegration.summarizeTest?.(
                { data: [], meta: { paging: { total: 0, limit: 1 } } },
                SETTINGS,
            ),
        ).toEqual({
            summary: `Connected to app ${APP_ID}`,
            facts: [{ label: 'App Store versions', value: '0' }],
        });
    });

    it('reads another shape as no summary', () => {
        expect(
            appStoreConnectIntegration.summarizeTest?.(
                { errors: [] },
                SETTINGS,
            ),
        ).toBeNull();
    });

    it('accepts only an App Store Connect key', () => {
        expect(() =>
            appStoreConnectIntegration.checkAuth({
                type: 'app_store_connect_key',
                origin: ORIGIN,
            }),
        ).not.toThrow();
        expect(() =>
            appStoreConnectIntegration.checkAuth({
                type: 'bearer_token',
                origin: ORIGIN,
            }),
        ).toThrow(
            'App Store Connect connections authenticate with a team API key: its key ID, issuer ID and .p8 private key',
        );
    });

    it.each(['123456', '6803089592', '123456789012'])(
        'accepts the app ID %s',
        (appId) => {
            expect(() =>
                appStoreConnectIntegration.validate({ ...SETTINGS, appId }),
            ).not.toThrow();
        },
    );

    it.each(['12345', '1234567890123', 'id1234567890', '../1'])(
        'refuses the app ID %s',
        (appId) => {
            expect(() =>
                appStoreConnectIntegration.validate({ ...SETTINGS, appId }),
            ).toThrow(
                "The App Store Connect app ID is the number in the app's App Store URL, such as 6803089592",
            );
        },
    );

    it('reaches only its own app, read-only', () => {
        expect(appStoreConnectIntegration.access(SETTINGS)).toEqual({
            pathPrefixes: [`/v1/apps/${APP_ID}/`],
            methods: ['GET'],
        });
        expect(
            appStoreConnectIntegration.describeTarget({
                settings: SETTINGS,
                origin: ORIGIN,
                targetLabel: null,
            }),
        ).toBe(`App Store Connect app ${APP_ID}`);
    });
});
