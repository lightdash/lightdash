import { describe, expect, test } from 'vitest';
import {
    shouldCheckSharedSignInStatus,
    shouldUseSharedSignInStatus,
} from './sharedSignInListenerDecision';

describe('shared sign-in listener decisions', () => {
    const projectUuid = 'project-a';
    const pendingProjects = new Set<string>();
    const openProjects = new Set<string>();
    const dismissedProjects = new Set<string>();
    const lastChecks = new Map<string, number>();
    const shouldCheck = (now: number) =>
        shouldCheckSharedSignInStatus({
            projectUuid,
            pendingProjects,
            openProjects,
            dismissedProjects,
            lastChecks,
            now,
        });

    test('checks again after a healthy response and a later expired error', () => {
        expect(shouldCheck(100_000)).toBe(true);
        lastChecks.set(projectUuid, 100_000);
        pendingProjects.add(projectUuid);
        pendingProjects.delete(projectUuid);
        expect(shouldCheck(159_999)).toBe(false);
        expect(shouldCheck(160_000)).toBe(true);
        openProjects.add(projectUuid);
        expect(shouldCheck(220_000)).toBe(false);
        openProjects.clear();
        lastChecks.clear();
    });

    test('a burst makes one status request', () => {
        expect(shouldCheck(100_000)).toBe(true);
        lastChecks.set(projectUuid, 100_000);
        pendingProjects.add(projectUuid);
        expect(shouldCheck(100_001)).toBe(false);
        pendingProjects.delete(projectUuid);
        expect(shouldCheck(100_002)).toBe(false);
        lastChecks.clear();
    });

    test('discards a response after navigation', () => {
        expect(
            shouldUseSharedSignInStatus(
                projectUuid,
                'project-b',
                dismissedProjects,
            ),
        ).toBe(false);
        expect(
            shouldUseSharedSignInStatus(
                projectUuid,
                projectUuid,
                dismissedProjects,
            ),
        ).toBe(true);
    });
});
