import {
    DirectAccessOrigin,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    SpaceMemberRole,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import type {
    ResourceAccessHandler,
    ResourceAccessInput,
} from './ResourceAccessHandler';

export type ResourceAccessHandlerConformanceHarness = {
    handler: ResourceAccessHandler;
    input: ResourceAccessInput;
    setActorRole(role: SpaceMemberRole | undefined): void;
    setEnabled(enabled: boolean): void;
    setEligible(eligible: boolean): void;
    setTargetError(error: Error | undefined): void;
    seedUserGrant(userUuid: string, role: SpaceMemberRole): void;
    seedGroupGrant(groupUuid: string, role: SpaceMemberRole): void;
    calls: {
        getTarget(): number;
        upsertUser(): number;
        revokeUser(): number;
        reset(): number;
    };
};

export const runResourceAccessHandlerConformance = (
    name: string,
    createHarness: () => ResourceAccessHandlerConformanceHarness,
): void => {
    describe(`${name} resource access conformance`, () => {
        it('checks the feature gate before resource lookup', async () => {
            const harness = createHarness();
            harness.setEnabled(false);

            await expect(
                harness.handler.listAccess(harness.input),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(harness.calls.getTarget()).toBe(0);
        });

        it('rejects malformed resource UUIDs before resource lookup', async () => {
            const harness = createHarness();

            await expect(
                harness.handler.listAccess({
                    ...harness.input,
                    resourceUuid: 'not-a-uuid',
                }),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(harness.calls.getTarget()).toBe(0);
        });

        it('normalizes unavailable targets', async () => {
            const harness = createHarness();
            harness.setTargetError(new ForbiddenError());

            await expect(
                harness.handler.listAccess(harness.input),
            ).rejects.toMatchObject({ message: 'Access target not found' });
        });

        it('does not reveal an ineligible target to an unauthorized caller', async () => {
            const harness = createHarness();
            harness.setEligible(false);
            harness.setActorRole(undefined);

            await expect(
                harness.handler.listAccess(harness.input),
            ).rejects.toBeInstanceOf(NotFoundError);
        });

        it('reports inherited-only targets after authorization', async () => {
            const harness = createHarness();
            harness.setEligible(false);

            await expect(
                harness.handler.listAccess(harness.input),
            ).rejects.toBeInstanceOf(ParameterError);
        });

        it('prevents viewers from inspecting access', async () => {
            const harness = createHarness();
            harness.setActorRole(SpaceMemberRole.VIEWER);

            await expect(
                harness.handler.listAccess(harness.input),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });

        it('allows editors to inspect access', async () => {
            const harness = createHarness();
            harness.seedUserGrant('user-2', SpaceMemberRole.VIEWER);

            await expect(
                harness.handler.listAccess(harness.input),
            ).resolves.toMatchObject({
                data: [
                    {
                        principal: {
                            type: DirectAccessOrigin.USER,
                            uuid: 'user-2',
                        },
                        directRole: SpaceMemberRole.VIEWER,
                    },
                ],
            });
        });

        it('allows editors to grant Viewer or Editor but not Admin', async () => {
            const harness = createHarness();

            await expect(
                harness.handler.replaceUserRole({
                    ...harness.input,
                    userUuid: 'user-2',
                    role: SpaceMemberRole.EDITOR,
                }),
            ).resolves.toMatchObject({ directRole: SpaceMemberRole.EDITOR });
            await expect(
                harness.handler.replaceUserRole({
                    ...harness.input,
                    userUuid: 'user-3',
                    role: SpaceMemberRole.ADMIN,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(harness.calls.upsertUser()).toBe(1);
        });

        it('prevents editors from changing an existing Admin grant', async () => {
            const harness = createHarness();
            harness.seedUserGrant('user-2', SpaceMemberRole.ADMIN);

            await expect(
                harness.handler.replaceUserRole({
                    ...harness.input,
                    userUuid: 'user-2',
                    role: SpaceMemberRole.EDITOR,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(harness.calls.upsertUser()).toBe(0);
        });

        it('allows a viewer to revoke their own direct grant', async () => {
            const harness = createHarness();
            harness.setActorRole(SpaceMemberRole.VIEWER);
            harness.seedUserGrant(
                harness.input.user.userUuid,
                SpaceMemberRole.VIEWER,
            );

            await expect(
                harness.handler.revokeUser({
                    ...harness.input,
                    userUuid: harness.input.user.userUuid,
                }),
            ).resolves.toBeUndefined();
            expect(harness.calls.revokeUser()).toBe(1);
        });

        it('keeps non-self revokes within the caller role ceiling', async () => {
            const harness = createHarness();
            harness.seedUserGrant('user-2', SpaceMemberRole.ADMIN);

            await expect(
                harness.handler.revokeUser({
                    ...harness.input,
                    userUuid: 'user-2',
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(harness.calls.revokeUser()).toBe(0);
        });

        it('makes missing principal revokes idempotent after authorization', async () => {
            const harness = createHarness();

            await expect(
                harness.handler.revokeUser({
                    ...harness.input,
                    userUuid: 'unknown-user',
                }),
            ).resolves.toBeUndefined();
            expect(harness.calls.revokeUser()).toBe(1);
        });

        it('prevents an Editor reset from removing Admin grants', async () => {
            const harness = createHarness();
            harness.seedGroupGrant('group-1', SpaceMemberRole.ADMIN);

            await expect(
                harness.handler.reset(harness.input),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(harness.calls.reset()).toBe(0);
        });

        it('allows Admin to manage and reset every grant role', async () => {
            const harness = createHarness();
            harness.setActorRole(SpaceMemberRole.ADMIN);
            harness.seedGroupGrant('group-1', SpaceMemberRole.ADMIN);

            await expect(
                harness.handler.replaceGroupRole({
                    ...harness.input,
                    groupUuid: 'group-2',
                    role: SpaceMemberRole.ADMIN,
                }),
            ).resolves.toMatchObject({ directRole: SpaceMemberRole.ADMIN });
            await expect(
                harness.handler.reset(harness.input),
            ).resolves.toBeUndefined();
            expect(harness.calls.reset()).toBe(1);
        });
    });
};
