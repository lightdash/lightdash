import { subject } from '@casl/ability';
import {
    ChangesetWithChanges,
    ForbiddenError,
    SessionUser,
} from '@lightdash/common';
import { CatalogModel } from '../models/CatalogModel/CatalogModel';
import { ChangesetModel } from '../models/ChangesetModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { BaseService } from './BaseService';

type ChangesetServiceArguments = {
    changesetModel: ChangesetModel;
    catalogModel: CatalogModel;
    projectModel: ProjectModel;
};

export class ChangesetService extends BaseService {
    private readonly changesetModel: ChangesetModel;

    private readonly catalogModel: CatalogModel;

    private readonly projectModel: ProjectModel;

    constructor(args: ChangesetServiceArguments) {
        super({ serviceName: 'ChangesetService' });
        this.changesetModel = args.changesetModel;
        this.catalogModel = args.catalogModel;
        this.projectModel = args.projectModel;
    }

    async findActiveChangesetWithChangesByProjectUuid(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ChangesetWithChanges | undefined> {
        if (
            user.ability.cannot(
                'manage',
                subject('Explore', {
                    projectUuid,
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view changesets in this project',
            );
        }

        return this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
            projectUuid,
        );
    }

    /**
     * @ref CatalogService.indexCatalogUpdates
     * Repeated the logic here to avoid injecting CatalogService
     */
    private async indexCatalogUpdates(
        projectUuid: string,
        exploreNames: string[],
    ) {
        const cachedExploreMap = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            exploreNames,
        );

        const changeset =
            await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                projectUuid,
                {
                    tableNames: exploreNames,
                },
            );

        if (!changeset) {
            return {
                catalogUpdates: [],
            };
        }

        return this.catalogModel.indexCatalogUpdates({
            projectUuid,
            cachedExploreMap,
            changeset,
        });
    }

    async revertChange(
        user: SessionUser,
        projectUuid: string,
        changeUuid: string,
    ): Promise<void> {
        if (
            user.ability.cannot(
                'manage',
                subject('Explore', {
                    projectUuid,
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to revert changes in this project',
            );
        }

        const change = await this.changesetModel.getChange(changeUuid);
        await this.changesetModel.revertChange(changeUuid);

        await this.indexCatalogUpdates(projectUuid, [change.entityTableName]);
    }

    async revertAllChanges(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        if (
            user.ability.cannot(
                'manage',
                subject('Explore', {
                    projectUuid,
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to revert changes in this project',
            );
        }

        const changeset =
            await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                projectUuid,
            );

        if (!changeset) {
            return;
        }

        const changeUuids = changeset.changes.map(
            (change) => change.changeUuid,
        );

        await this.changesetModel.revertChanges({ changeUuids });

        const uniqueTableNames = [
            ...new Set(
                changeset.changes.map((change) => change.entityTableName),
            ),
        ];
        await this.indexCatalogUpdates(projectUuid, uniqueTableNames);
    }
}
