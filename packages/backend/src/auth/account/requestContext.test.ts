import { LightdashCliVersionHeader } from '@lightdash/common';
import { type Request } from 'express';
import { requestContextFromExpress } from './requestContext';

describe('requestContextFromExpress', () => {
    it.each([
        ['3.56.0', '3.56.0'],
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
