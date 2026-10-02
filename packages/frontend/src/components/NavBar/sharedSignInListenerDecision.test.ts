import { describe, expect, test, vi } from 'vitest';
import {
    queryBelongsToProject,
    scheduleSharedSignInCooldownCheck,
    shouldCheckSharedSignInStatus,
    shouldUseSharedSignInStatus,
} from './sharedSignInListenerDecision';

describe('shared sign-in listener decisions', () => {
    test('ignores cached errors from another project or an unscoped query', () => {
        expect(queryBelongsToProject(['query', 'project-a'], 'project-b')).toBe(
            false,
        );
        expect(queryBelongsToProject(['query'], 'project-b')).toBe(false);
        expect(queryBelongsToProject(undefined, 'project-b')).toBe(false);
        expect(queryBelongsToProject(['query', 'project-b'], 'project-b')).toBe(
            true,
        );
    });

    test('runs one trailing check at the cooldown boundary and cancels it on cleanup', () => {
        vi.useFakeTimers();
        vi.setSystemTime(100_000);
        const check = vi.fn();
        const timer = scheduleSharedSignInCooldownCheck(90_000, check);
        vi.advanceTimersByTime(49_999);
        expect(check).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(check).toHaveBeenCalledOnce();
        const cancelled = scheduleSharedSignInCooldownCheck(140_000, check);
        clearTimeout(cancelled);
        clearTimeout(timer);
        vi.advanceTimersByTime(60_000);
        expect(check).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });
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
