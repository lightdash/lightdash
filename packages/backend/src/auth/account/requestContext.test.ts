import { LightdashCliVersionHeader } from '@lightdash/common';
import { type Request } from 'express';
import { requestContextFromExpress } from './requestContext';

describe('requestContextFromExpress', () => {
    it.each([
        ['3.56.0', '3.56.0'],
        ['3.57.0-rc.1', '3.57.0-rc.1'],
        ['0.0.0-0', '0.0.0-0'],
        [`3.57.0-${'a'.repeat(25)}`, `3.57.0-${'a'.repeat(25)}`],
        [`3.57.0-${'a'.repeat(26)}`, null],
        ['Bearer secret-token', null],
        ['person@example.test', null],
        ['v3.57.0', null],
        ['03.57.0', null],
        ['3.57', null],
        ['3.57.0-01', null],
        ['3.57.0-rc..1', null],
        ['3.57.0+build', null],
        ['3.57.0\n', null],
        [['3.56.0', '3.57.0'], '3.56.0'],
        [undefined, null],
    ])('captures CLI version header %j', (header, expected) => {
        const request = {
            headers: {
                [LightdashCliVersionHeader.toLowerCase()]: header,
                'user-agent': 'cli-agent',
                authorization: 'Bearer never-log-this-token',
            },
            ip: '127.0.0.1',
        } as Request;
        expect(requestContextFromExpress(request)).toEqual({
            cliVersion: expected,
            userAgent: 'cli-agent',
            ip: '127.0.0.1',
            requestId: undefined,
        });
    });
});

it.each([
    ['cli/3.56.0 (person@example.test)', 'cli/3.56.0 ([redacted])'],
    ['cli\r\n\t\u0000\u007f\u0085/3.56.0', 'cli/3.56.0'],
    ['x'.repeat(257), 'x'.repeat(256)],
    [`${'x'.repeat(249)} person@example.test`, `${'x'.repeat(249)} [redac`],
    [undefined, undefined],
])('normalizes user-agent %j', (header, expected) => {
    expect(
        requestContextFromExpress({
            headers: { 'user-agent': header },
        } as Request).userAgent,
    ).toBe(expected);
});
