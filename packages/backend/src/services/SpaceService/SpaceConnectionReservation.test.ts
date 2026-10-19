import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    SpaceMemberRole,
} from '@lightdash/common';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { BaseService } from '../BaseService';
import { SpaceConnectionReservation } from './SpaceConnectionReservation';
import { type AccessContextForCasl } from './SpacePermissionService';

class TestService extends BaseService {
    getAbility(managesSpace: boolean, managesSqlRunner = true) {
        return this.createAuditedAbility({
            ...defaultSessionUser,
            ability: new Ability([
                ...(managesSpace
                    ? [{ action: 'manage' as const, subject: 'Space' as const }]
                    : []),
                ...(managesSqlRunner
                    ? [
                          {
                              action: 'manage' as const,
                              subject: 'SqlRunner' as const,
                          },
                      ]
                    : []),
            ]),
        });
    }
}

const { userUuid } = defaultSessionUser;
const context = (role: SpaceMemberRole): AccessContextForCasl => ({
    organizationUuid: 'org',
    projectUuid: 'project',
    inheritsFromOrgOrProject: false,
    access: [
        {
            userUuid,
            role,
            hasDirectAccess: true,
            projectRole: undefined,
            inheritedRole: undefined,
            inheritedFrom: undefined,
        },
    ],
    admins: [],
    directOnly: false,
});

describe('SpaceConnectionReservation', () => {
    const featureFlagModel = { get: vi.fn() };
    const spaceModel = {
        getConnectionBoundSpaces: vi.fn(),
        getEffectiveWarehouseConnectionUuid: vi.fn(),
    };
    const spacePermissionService = { resolveAccessBatch: vi.fn() };
    const reservation = new SpaceConnectionReservation({
        featureFlagModel,
        spaceModel,
        spacePermissionService,
    });
    const args = () => ({
        userUuid,
        ability: new TestService().getAbility(false),
        organizationUuid: 'org',
        projectUuid: 'project',
    });

    beforeEach(() => {
        vi.resetAllMocks();
        featureFlagModel.get.mockResolvedValue({ enabled: true });
        spaceModel.getEffectiveWarehouseConnectionUuid.mockResolvedValue(null);
        spaceModel.getConnectionBoundSpaces.mockResolvedValue([
            { spaceUuid: 'private', warehouseConnectionUuid: 'connection' },
        ]);
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            {
                target: { type: 'space', spaceUuid: 'private' },
                context: context(SpaceMemberRole.VIEWER),
            },
        ]);
    });

    it('does no space lookups while disabled', async () => {
        featureFlagModel.get.mockResolvedValue({ enabled: false });
        expect(await reservation.getReservedConnectionUuids(args())).toEqual(
            new Set(),
        );
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            user: { organizationUuid: 'org' },
            featureFlagId: FeatureFlags.SpaceWarehouseConnections,
        });
        expect(spaceModel.getConnectionBoundSpaces).not.toHaveBeenCalled();
        expect(
            spacePermissionService.resolveAccessBatch,
        ).not.toHaveBeenCalled();
    });

    it('reserves nothing when there are no bound spaces', async () => {
        spaceModel.getConnectionBoundSpaces.mockResolvedValue([]);
        expect(await reservation.getReservedConnectionUuids(args())).toEqual(
            new Set(),
        );
        expect(
            spacePermissionService.resolveAccessBatch,
        ).not.toHaveBeenCalled();
    });

    it('reserves the connection for a viewer and rejects its use', async () => {
        expect(await reservation.getReservedConnectionUuids(args())).toEqual(
            new Set(['connection']),
        );
        await expect(
            reservation.assertCanUseConnection({
                ...args(),
                warehouseConnectionUuid: 'connection',
            }),
        ).rejects.toThrow(
            new ForbiddenError(
                'This connection is reserved for a space you cannot edit.',
            ),
        );
        await expect(
            reservation.assertCanUseConnection({
                ...args(),
                warehouseConnectionUuid: 'other',
            }),
        ).resolves.toBeUndefined();
    });

    it.each([SpaceMemberRole.EDITOR, SpaceMemberRole.ADMIN])(
        'allows a direct %s',
        async (role) => {
            spacePermissionService.resolveAccessBatch.mockResolvedValue([
                {
                    target: { type: 'space', spaceUuid: 'private' },
                    context: context(role),
                },
            ]);
            expect(
                await reservation.getReservedConnectionUuids(args()),
            ).toEqual(new Set());
        },
    );

    it('allows a space manager through ability', async () => {
        expect(
            await reservation.getReservedConnectionUuids({
                ...args(),
                ability: new TestService().getAbility(true),
            }),
        ).toEqual(new Set());
    });

    it('treats unresolved spaces as no access even for a manager', async () => {
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            {
                target: { type: 'space', spaceUuid: 'private' },
                context: undefined,
            },
        ]);
        expect(
            await reservation.getReservedConnectionUuids({
                ...args(),
                ability: new TestService().getAbility(true),
            }),
        ).toEqual(new Set(['connection']));
    });

    it('batches all spaces and allows a connection if any bound space is editable', async () => {
        spaceModel.getConnectionBoundSpaces.mockResolvedValue([
            { spaceUuid: 'private', warehouseConnectionUuid: 'connection' },
            { spaceUuid: 'editable', warehouseConnectionUuid: 'connection' },
            { spaceUuid: 'missing', warehouseConnectionUuid: 'other' },
        ]);
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            {
                target: { type: 'space', spaceUuid: 'private' },
                context: context(SpaceMemberRole.VIEWER),
            },
            {
                target: { type: 'space', spaceUuid: 'editable' },
                context: context(SpaceMemberRole.EDITOR),
            },
        ]);
        expect(await reservation.getReservedConnectionUuids(args())).toEqual(
            new Set(['other']),
        );
        expect(
            spacePermissionService.resolveAccessBatch,
        ).toHaveBeenCalledExactlyOnceWith(userUuid, [
            { type: 'space', spaceUuid: 'private' },
            { type: 'space', spaceUuid: 'editable' },
            { type: 'space', spaceUuid: 'missing' },
        ]);
    });

    it("does not use another person's editor grant", async () => {
        const ctx = context(SpaceMemberRole.EDITOR);
        ctx.access[0].userUuid = 'someone-else';
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            { target: { type: 'space', spaceUuid: 'private' }, context: ctx },
        ]);
        expect(await reservation.getReservedConnectionUuids(args())).toEqual(
            new Set(['connection']),
        );
    });

    it('requires SqlRunner permission even when the space is editable', async () => {
        await expect(
            reservation.assertCanUseConnection({
                ...args(),
                ability: new TestService().getAbility(true, false),
                warehouseConnectionUuid: 'connection',
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
            reservation.assertCanUseConnection({
                ...args(),
                ability: new TestService().getAbility(true, false),
                warehouseConnectionUuid: 'unreserved',
            }),
        ).resolves.toBeUndefined();
    });

    it.each([null, undefined, 'unreserved'])(
        'checks the space connection before the named connection %s',
        async (warehouseConnectionUuid) => {
            spaceModel.getEffectiveWarehouseConnectionUuid.mockResolvedValue(
                'connection',
            );
            await expect(
                reservation.assertCanAuthorSqlInSpace({
                    ...args(),
                    spaceUuid: 'private',
                    warehouseConnectionUuid,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
        },
    );

    it('allows SQL on an unreserved space override of a reserved named connection', async () => {
        spaceModel.getEffectiveWarehouseConnectionUuid.mockResolvedValue(
            'unreserved',
        );
        await expect(
            reservation.assertCanAuthorSqlInSpace({
                ...args(),
                spaceUuid: 'private',
                warehouseConnectionUuid: 'connection',
            }),
        ).resolves.toBeUndefined();
    });

    it('refuses child creation under a reserved parent connection', async () => {
        spaceModel.getEffectiveWarehouseConnectionUuid.mockResolvedValue(
            'connection',
        );
        await expect(
            reservation.assertCanCreateInSpace({
                ...args(),
                spaceUuid: 'private',
            }),
        ).rejects.toThrow(
            'You need edit access on a space that uses this connection',
        );
    });

    it('lets an editor without SqlRunner create a child under a reserved parent', async () => {
        spaceModel.getEffectiveWarehouseConnectionUuid.mockResolvedValue(
            'connection',
        );
        spacePermissionService.resolveAccessBatch.mockResolvedValue([
            {
                target: { type: 'space', spaceUuid: 'private' },
                context: context(SpaceMemberRole.EDITOR),
            },
        ]);
        const ability = new TestService().getAbility(false, false);
        await expect(
            reservation.assertCanCreateInSpace({
                ...args(),
                ability,
                spaceUuid: 'private',
            }),
        ).resolves.toBeUndefined();
        await expect(
            reservation.assertCanUseConnection({
                ...args(),
                ability,
                warehouseConnectionUuid: 'connection',
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('does no space or access lookups for either write guard while disabled', async () => {
        featureFlagModel.get.mockResolvedValue({ enabled: false });
        await reservation.assertCanAuthorSqlInSpace({
            ...args(),
            spaceUuid: 'private',
            warehouseConnectionUuid: null,
        });
        await reservation.assertCanCreateInSpace({
            ...args(),
            spaceUuid: 'private',
        });
        expect(spaceModel.getConnectionBoundSpaces).not.toHaveBeenCalled();
        expect(
            spaceModel.getEffectiveWarehouseConnectionUuid,
        ).not.toHaveBeenCalled();
        expect(
            spacePermissionService.resolveAccessBatch,
        ).not.toHaveBeenCalled();
    });
});
