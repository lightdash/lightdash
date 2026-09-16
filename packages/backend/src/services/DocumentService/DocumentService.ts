import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type Document,
    type DocumentList,
    type RegisteredAccount,
} from '@lightdash/common';
import type { DocumentModel } from '../../models/DocumentModel';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type DocumentServiceArguments = {
    documentModel: DocumentModel;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    spacePermissionService: SpacePermissionService;
};

export class DocumentService extends BaseService {
    constructor(private readonly dependencies: DocumentServiceArguments) {
        super();
    }

    async list(
        account: RegisteredAccount,
        projectUuid: string,
        { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
    ): Promise<DocumentList> {
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100 ||
            !Number.isSafeInteger(offset) ||
            offset < 0
        ) {
            throw new ParameterError(
                'Document pagination requires limit 1–100 and a non-negative integer offset',
            );
        }
        const project = await this.assertProjectAccess(account, projectUuid);
        const spaceUuids =
            await this.dependencies.documentModel.listSpaceUuids(projectUuid);
        const access =
            await this.dependencies.spacePermissionService.resolveAccessBatch(
                account.user.userUuid,
                spaceUuids.map((spaceUuid) => ({
                    type: 'space',
                    spaceUuid,
                })),
            );
        const ability = this.createAuditedAbility(account);
        const allowedSpaceUuids = spaceUuids.filter((_spaceUuid, index) => {
            const context = access[index]?.context;
            return (
                context !== undefined &&
                ability.can(
                    'view',
                    subject('Document', {
                        ...context,
                        organizationUuid: project.organizationUuid,
                        projectUuid,
                    }),
                )
            );
        });
        const items = await this.dependencies.documentModel.list(projectUuid, {
            spaceUuids: allowedSpaceUuids,
            limit: limit + 1,
            offset,
        });
        return {
            items: items.slice(0, limit),
            nextOffset: items.length > limit ? offset + limit : null,
        };
    }

    async get(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ): Promise<Document> {
        await this.assertProjectAccess(account, projectUuid);
        const document = await this.dependencies.documentModel.get(
            projectUuid,
            documentUuid,
        );
        const context =
            await this.dependencies.spacePermissionService.resolveAccess(
                account.user.userUuid,
                { type: 'space', spaceUuid: document.spaceUuid },
            );
        if (
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Document', {
                    ...context,
                    organizationUuid: document.organizationUuid,
                    projectUuid: document.projectUuid,
                }),
            )
        ) {
            throw new NotFoundError('Document not found');
        }
        return document;
    }

    private async assertProjectAccess(
        account: RegisteredAccount,
        projectUuid: string,
    ) {
        const project =
            await this.dependencies.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Project', project),
            )
        ) {
            throw new NotFoundError('Project not found');
        }
        const flag = await this.dependencies.featureFlagModel.get({
            featureFlagId: FeatureFlags.Documents,
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: project.organizationUuid,
            },
        });
        if (!flag.enabled) {
            throw new ForbiddenError('Documents are not enabled');
        }
        return project;
    }
}
