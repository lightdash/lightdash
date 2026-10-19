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
    getAbility(managesSpace: boolean) {
        return this.createAuditedAbility({
            ...defaultSessionUser,
            ability: new Ability(
                managesSpace ? [{ action: 'manage', subject: 'Space' }] : [],
            ),
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
    const spaceModel = { getConnectionBoundSpaces: vi.fn() };
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
});
