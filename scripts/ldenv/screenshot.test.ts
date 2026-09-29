import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { screenshotOptions } from './screenshot';

test('screenshot options keep route and image settings separate', () => {
    assert.deepEqual(screenshotOptions(['screenshot']), {
        route: '/',
        out: null,
        signedOut: false,
        fullPage: false,
        width: 1440,
        height: 900,
    });
    assert.deepEqual(
        screenshotOptions([
            'screenshot',
            '/projects/demo',
            '--width',
            '1024',
            '--height',
            '768',
            '--full-page',
            '--signed-out',
            '--out',
            'shot.png',
        ]),
        {
            route: '/projects/demo',
            out: path.resolve('shot.png'),
            signedOut: true,
            fullPage: true,
            width: 1024,
            height: 768,
        },
    );
    assert.throws(() =>
        screenshotOptions(['screenshot', 'https://example.com']),
    );
    assert.throws(() => screenshotOptions(['screenshot', '//example.com']));
    assert.throws(() => screenshotOptions(['screenshot', '--width', '10']));
});
