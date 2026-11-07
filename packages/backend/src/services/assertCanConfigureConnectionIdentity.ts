import { subject, type Ability } from '@casl/ability';
import {
    ForbiddenError,
    USER_CREATABLE_PROJECT_TYPES,
    type UUID,
} from '@lightdash/common';
import { type CaslAuditWrapper } from '../logging/caslAuditWrapper';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';

export const assertCanConfigureConnectionIdentity = async ({
    ability,
    organizationUuid,
    projectModel,
    projectUuid,
}: {
    ability: CaslAuditWrapper<Ability>;
    organizationUuid: UUID;
    projectModel: Pick<ProjectModel, 'getSummary'>;
    projectUuid: UUID | undefined;
}) => {
    if (projectUuid !== undefined) {
        const project = await projectModel.getSummary(projectUuid);
        if (
            ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                    upstreamProjectUuid: project.upstreamProjectUuid,
                    type: project.type,
                    createdByUserUuid: project.createdByUserUuid,
                }),
            ) ||
            project.organizationUuid !== organizationUuid
        ) {
            throw new ForbiddenError();
        }
    } else if (
        USER_CREATABLE_PROJECT_TYPES.every((type) =>
            ability.cannot(
                'create',
                subject('Project', { organizationUuid, type }),
            ),
        )
    ) {
        throw new ForbiddenError();
    }
};
