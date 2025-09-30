import { subject } from '@casl/ability';
import {
    ChangesetWithChanges,
    ForbiddenError,
    SessionUser,
} from '@lightdash/common';
import { ChangesetModel } from '../models/ChangesetModel';
import { BaseService } from './BaseService';

type ChangesetServiceArguments = {
    changesetModel: ChangesetModel;
};

export class ChangesetService extends BaseService {
    private readonly changesetModel: ChangesetModel;

    constructor(args: ChangesetServiceArguments) {
        super({ serviceName: 'ChangesetService' });
        this.changesetModel = args.changesetModel;
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
}
