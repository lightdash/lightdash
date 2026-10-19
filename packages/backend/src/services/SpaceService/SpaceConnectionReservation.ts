import { subject, type Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    SpaceMemberRole,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type SpaceModel } from '../../models/SpaceModel';
import { type SpacePermissionService } from './SpacePermissionService';

type ReservationContext = {
    userUuid: string;
    ability: CaslAuditWrapper<Ability>;
    organizationUuid: string;
    projectUuid: string;
};

type SpaceConnectionReservationArguments = {
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    spaceModel: Pick<SpaceModel, 'getConnectionBoundSpaces'>;
    spacePermissionService: Pick<SpacePermissionService, 'resolveAccessBatch'>;
};

export class SpaceConnectionReservation {
    constructor(
        private readonly dependencies: SpaceConnectionReservationArguments,
    ) {}

    async getReservedConnectionUuids({
        userUuid,
        ability,
        organizationUuid,
        projectUuid,
    }: ReservationContext): Promise<Set<string>> {
        const { enabled } = await this.dependencies.featureFlagModel.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.SpaceWarehouseConnections,
        });
        if (!enabled) return new Set();
        const spaces =
            await this.dependencies.spaceModel.getConnectionBoundSpaces({
                projectUuid,
            });
        if (spaces.length === 0) return new Set();
        const results =
            await this.dependencies.spacePermissionService.resolveAccessBatch(
                userUuid,
                [...new Set(spaces.map(({ spaceUuid }) => spaceUuid))].map(
                    (spaceUuid) => ({ type: 'space', spaceUuid }),
                ),
            );
        const editableSpaces = new Set(
            results
                .filter(
                    ({ context }) =>
                        context !== undefined &&
                        (ability.can('manage', subject('Space', context)) ||
                            context.access.some(
                                (access) =>
                                    access.userUuid === userUuid &&
                                    (access.role === SpaceMemberRole.EDITOR ||
                                        access.role === SpaceMemberRole.ADMIN),
                            )),
                )
                .map(({ target }) => target.spaceUuid),
        );
        const usableConnections = new Set(
            spaces
                .filter(({ spaceUuid }) => editableSpaces.has(spaceUuid))
                .map(({ warehouseConnectionUuid }) => warehouseConnectionUuid),
        );
        return new Set(
            spaces
                .map(({ warehouseConnectionUuid }) => warehouseConnectionUuid)
                .filter((uuid) => !usableConnections.has(uuid)),
        );
    }

    async assertCanUseConnection({
        warehouseConnectionUuid,
        ...context
    }: ReservationContext & {
        warehouseConnectionUuid: string;
    }): Promise<void> {
        if (
            (await this.getReservedConnectionUuids(context)).has(
                warehouseConnectionUuid,
            )
        ) {
            throw new ForbiddenError(
                'This connection is reserved for a space you cannot edit.',
            );
        }
    }
}
