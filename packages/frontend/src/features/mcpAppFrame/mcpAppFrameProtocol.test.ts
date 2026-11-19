import {
    MCP_APP_PARENT_STORAGE_KEY,
    parseFrameRequest,
    parseParentOrigin,
    resolveMcpAppParentOrigin,
    resolveSameOriginPath,
} from './mcpAppFrameProtocol';

const memoryStorage = () => {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
};

describe('parseParentOrigin', () => {
    it.each([
        [
            'https://abc.claudemcpcontent.com',
            'https://abc.claudemcpcontent.com',
        ],
        ['http://localhost:8081', 'http://localhost:8081'],
    ])('accepts the origin %s', (value, expected) => {
        expect(parseParentOrigin(value)).toBe(expected);
    });

    it.each([
        'null',
        'https://abc.claudemcpcontent.com/path',
        'data:text/html,hi',
        '',
        undefined,
        42,
    ])('refuses %s', (value) => {
        expect(parseParentOrigin(value)).toBeNull();
    });
});

describe('resolveMcpAppParentOrigin', () => {
    it('is off outside a frame', () => {
        expect(
            resolveMcpAppParentOrigin({
                search: '?mcpAppParent=https%3A%2F%2Fa.example',
                storage: memoryStorage(),
                isFramed: false,
            }),
        ).toBeNull();
    });

    it('keeps the parent origin for later pages in the same frame', () => {
        const storage = memoryStorage();
        expect(
            resolveMcpAppParentOrigin({
                search: '?mcpAppParent=https%3A%2F%2Fa.example',
                storage,
                isFramed: true,
            }),
        ).toBe('https://a.example');
        expect(storage.getItem(MCP_APP_PARENT_STORAGE_KEY)).toBe(
            'https://a.example',
        );
        expect(
            resolveMcpAppParentOrigin({ search: '', storage, isFramed: true }),
        ).toBe('https://a.example');
    });

    it('is off in a frame that never received a parent origin', () => {
        expect(
            resolveMcpAppParentOrigin({
                search: '',
                storage: memoryStorage(),
                isFramed: true,
            }),
        ).toBeNull();
    });
});

describe('parseFrameRequest', () => {
    it('reads an add filter command', () => {
        expect(
            parseFrameRequest({
                type: 'lightdash:frame:command',
                id: '1',
                command: 'addFilter',
                args: {
                    fieldId: 'orders_status',
                    operator: 'equals',
                    values: ['completed'],
                },
            }),
        ).toEqual({
            id: '1',
            command: 'addFilter',
            args: {
                fieldId: 'orders_status',
                operator: 'equals',
                values: ['completed'],
            },
        });
    });

    it.each([
        { type: 'lightdash:frame:command', id: '1', command: 'addField' },
        { type: 'lightdash:frame:command', command: 'runQuery' },
        { type: 'lightdash:frame:command', id: '1', command: 'deleteProject' },
        { type: 'lightdash:locationChanged', id: '1', command: 'runQuery' },
        null,
        'runQuery',
    ])('ignores %j', (data) => {
        expect(parseFrameRequest(data)).toBeNull();
    });
});

describe('resolveSameOriginPath', () => {
    const origin = 'https://app.lightdash.example';

    it('keeps a path on this site', () => {
        expect(
            resolveSameOriginPath('/projects/p1/tables/orders?x=1', origin),
        ).toBe('/projects/p1/tables/orders?x=1');
    });

    it.each(['https://evil.example/', '//evil.example/x'])(
        'refuses %s',
        (path) => {
            expect(resolveSameOriginPath(path, origin)).toBeNull();
        },
    );
});
