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
    spaceModel: Pick<
        SpaceModel,
        | 'getConnectionBoundSpaces'
        | 'getEffectiveWarehouseConnectionUuid'
        | 'getEffectiveWarehouseConnectionBinding'
    >;
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
        requireSqlRunner = true,
        additionalBoundSpaces = [],
    }: ReservationContext & {
        requireSqlRunner?: boolean;
        additionalBoundSpaces?: {
            spaceUuid: string;
            warehouseConnectionUuid: string;
        }[];
    }): Promise<Set<string>> {
        const { enabled } = await this.dependencies.featureFlagModel.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.SpaceWarehouseConnections,
        });
        if (!enabled) return new Set();
        const spaces = [
            ...(await this.dependencies.spaceModel.getConnectionBoundSpaces({
                projectUuid,
            })),
            ...additionalBoundSpaces,
        ];
        if (spaces.length === 0) return new Set();
        const targets = [
            ...new Set(spaces.map(({ spaceUuid }) => spaceUuid)),
        ].map((spaceUuid) => ({ type: 'space' as const, spaceUuid }));
        const results =
            additionalBoundSpaces.length > 0
                ? await this.dependencies.spacePermissionService.resolveAccessBatch(
                      userUuid,
                      targets,
                      { includeDeletedSpaces: true },
                  )
                : await this.dependencies.spacePermissionService.resolveAccessBatch(
                      userUuid,
                      targets,
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
                .filter(
                    ({ spaceUuid }) =>
                        (!requireSqlRunner ||
                            ability.can(
                                'manage',
                                subject('SqlRunner', {
                                    organizationUuid,
                                    projectUuid,
                                }),
                            )) &&
                        editableSpaces.has(spaceUuid),
                )
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
        errorMessage = 'This connection is reserved for a space you cannot edit.',
        ...context
    }: ReservationContext & {
        warehouseConnectionUuid: string;
        errorMessage?: string;
        requireSqlRunner?: boolean;
    }): Promise<void> {
        if (
            (await this.getReservedConnectionUuids(context)).has(
                warehouseConnectionUuid,
            )
        ) {
            throw new ForbiddenError(errorMessage);
        }
    }

    async assertCanCreateInSpace({
        spaceUuid,
        ...context
    }: ReservationContext & { spaceUuid: string }): Promise<void> {
        const { enabled } = await this.dependencies.featureFlagModel.get({
            user: { organizationUuid: context.organizationUuid },
            featureFlagId: FeatureFlags.SpaceWarehouseConnections,
        });
        if (!enabled) return;
        const warehouseConnectionUuid =
            await this.dependencies.spaceModel.getEffectiveWarehouseConnectionUuid(
                {
                    projectUuid: context.projectUuid,
                    spaceUuid,
                },
            );
        if (warehouseConnectionUuid !== null) {
            await this.assertCanUseConnection({
                ...context,
                warehouseConnectionUuid,
                errorMessage:
                    'You need edit access on a space that uses this connection to create or move a space inside it.',
                requireSqlRunner: false,
            });
        }
    }

    async assertCanAuthorSqlInSpace({
        spaceUuid,
        warehouseConnectionUuid,
        includeDeletedSpaces = false,
        ...context
    }: ReservationContext & {
        spaceUuid: string | (() => Promise<string>);
        warehouseConnectionUuid?: string | null;
        includeDeletedSpaces?: boolean;
    }): Promise<void> {
        if (includeDeletedSpaces) {
            const { enabled } = await this.dependencies.featureFlagModel.get({
                user: { organizationUuid: context.organizationUuid },
                featureFlagId: FeatureFlags.SpaceWarehouseConnections,
            });
            if (!enabled) return;
            const binding =
                await this.dependencies.spaceModel.getEffectiveWarehouseConnectionBinding(
                    {
                        projectUuid: context.projectUuid,
                        spaceUuid:
                            typeof spaceUuid === 'string'
                                ? spaceUuid
                                : await spaceUuid(),
                        includeDeleted: true,
                    },
                );
            if (binding?.isOriginal) return;
            const reserved = await this.getReservedConnectionUuids({
                ...context,
                additionalBoundSpaces: binding ? [binding] : [],
            });
            if (
                reserved.has(
                    binding?.warehouseConnectionUuid ??
                        warehouseConnectionUuid ??
                        '',
                )
            ) {
                throw new ForbiddenError(
                    'This connection is reserved for a space you cannot edit.',
                );
            }
            return;
        }
        const reserved = await this.getReservedConnectionUuids(context);
        if (reserved.size === 0) return;
        const effectiveConnectionUuid =
            (await this.dependencies.spaceModel.getEffectiveWarehouseConnectionUuid(
                {
                    projectUuid: context.projectUuid,
                    spaceUuid:
                        typeof spaceUuid === 'string'
                            ? spaceUuid
                            : await spaceUuid(),
                },
            )) ?? warehouseConnectionUuid;
        if (effectiveConnectionUuid && reserved.has(effectiveConnectionUuid)) {
            throw new ForbiddenError(
                'This connection is reserved for a space you cannot edit.',
            );
        }
    }
}
