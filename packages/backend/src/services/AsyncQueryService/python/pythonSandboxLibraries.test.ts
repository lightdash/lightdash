import { PYTHON_SANDBOX_LIBRARIES } from '@lightdash/common';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCKERFILE_PATH = path.resolve(
    __dirname,
    '../../../../../../sandboxes/python-runner/e2b.Dockerfile',
);

describe('PYTHON_SANDBOX_LIBRARIES', () => {
    it('matches the pins in the python sandbox image', () => {
        const pins = [
            ...readFileSync(DOCKERFILE_PATH, 'utf8').matchAll(
                /"([A-Za-z0-9._-]+)==([^"]+)"/g,
            ),
        ].map(([, name, version]) => ({ name, version }));
        expect(pins.length).toBeGreaterThan(0);
        expect(pins).toEqual(PYTHON_SANDBOX_LIBRARIES);
    });
});
