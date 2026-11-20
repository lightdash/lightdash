import {
    getRawThreadFileBody,
    keepRawThreadFileBodyPrivate,
} from './rawThreadFileBody';

test('parsed bytes are private, preserve identity and remain available to the controller', () => {
    const bytes = Buffer.from('private upload');
    const request: { body: unknown } = { body: bytes };
    const next = vi.fn<() => void>();
    keepRawThreadFileBodyPrivate(request, undefined, next);
    expect(request.body).toBeUndefined();
    expect(getRawThreadFileBody(request)).toBe(bytes);
    expect(getRawThreadFileBody(request)).toBe(bytes);
    expect(getRawThreadFileBody({})).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain('private upload');
    expect(next).toHaveBeenCalledOnce();
});

test.each([undefined, null, 'text', 42, { text: 'unchanged' }])(
    'non-Buffer bodies are untouched: %j',
    (body) => {
        const request = { body };
        const next = vi.fn<() => void>();
        keepRawThreadFileBodyPrivate(request, undefined, next);
        expect(request.body).toBe(body);
        expect(getRawThreadFileBody(request)).toBeUndefined();
        expect(next).toHaveBeenCalledOnce();
    },
);
