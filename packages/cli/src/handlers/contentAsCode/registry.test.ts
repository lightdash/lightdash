import { describe, expect, it } from 'vitest';
import {
    assertCodeResourceDependencyOrder,
    ORGANIZATION_CODE_RESOURCES,
    PROJECT_CODE_RESOURCES,
} from './registry';

describe('content-as-code resource registry', () => {
    it('keeps organization dependencies in a valid order', () => {
        expect(() =>
            assertCodeResourceDependencyOrder(ORGANIZATION_CODE_RESOURCES),
        ).not.toThrow();
    });

    it('keeps project dependencies in a valid order', () => {
        expect(() =>
            assertCodeResourceDependencyOrder(PROJECT_CODE_RESOURCES),
        ).not.toThrow();
    });

    it('rejects resources registered before their dependencies', () => {
        expect(() =>
            assertCodeResourceDependencyOrder([
                { kind: 'group', dependencies: ['user'] },
                { kind: 'user', dependencies: [] },
            ]),
        ).toThrow('group');
    });
});
