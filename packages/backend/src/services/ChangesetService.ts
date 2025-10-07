import { subject } from '@casl/ability';
import {
    Change,
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

    async getChange(
        user: SessionUser,
        projectUuid: string,
        changeUuid: string,
    ): Promise<Change> {
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
                'You do not have permission to view changes in this project',
            );
        }

        return this.changesetModel.getChange(changeUuid);
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

        // Get the full changeset BEFORE deleting the change
        const originalChangeset =
            await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                projectUuid,
            );

        if (!originalChangeset) {
            return;
        }

        const change = await this.changesetModel.getChange(changeUuid);

        // Get original explores WITHOUT any changes for revert reconstruction
        const originalExplores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            originalChangeset.changes.map((c) => c.entityTableName),
            { applyChangeset: false },
        );

        // Delete the change
        await this.changesetModel.revertChange(changeUuid);

        // Update catalog using revert logic
        await this.catalogModel.indexCatalogReverts({
            projectUuid,
            revertedChanges: [change],
            originalChangeset,
            originalExplores,
        });
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

        // Get original explores WITHOUT any changes for revert reconstruction
        const originalExplores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            changeset.changes.map((change) => change.entityTableName),
            { applyChangeset: false },
        );

        await this.changesetModel.revertChanges({ changeUuids });

        await this.catalogModel.indexCatalogReverts({
            projectUuid,
            revertedChanges: changeset.changes,
            originalChangeset: changeset,
            originalExplores,
        });
    }
}
