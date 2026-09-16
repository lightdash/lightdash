import { type Knex } from 'knex';
import {
    DocumentGroupAccessTableName,
    DocumentUserAccessTableName,
} from '../database/entities/documentAccess';
import { DocumentsTableName } from '../database/entities/documents';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import {
    getActiveGrantedGroupPredicate,
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    type DirectAccess,
    type DirectAccessRow,
} from './directAccessModelUtils';

export type DocumentDirectAccess = DirectAccess;

/**
 * Read model for document direct grants, consumed by the authorization
 * kernel. Administration writes live in DirectAccessModel.
 */
export class DocumentAccessModel {
    constructor(private readonly database: Knex) {}

    async getUserAccess(
        documentUuids: string[],
        userUuid: string,
        {
            trx = this.database,
            organizationUuid,
        }: {
            trx?: Knex;
            organizationUuid: string;
        },
    ): Promise<Record<string, DocumentDirectAccess>> {
        const uniqueDocumentUuids = [...new Set(documentUuids)];
        if (uniqueDocumentUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(DocumentUserAccessTableName)
            .select({
                resourceUuid: `${DocumentUserAccessTableName}.document_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                role: `${DocumentUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                DocumentsTableName,
                `${DocumentsTableName}.document_uuid`,
                `${DocumentUserAccessTableName}.document_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DocumentsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DocumentUserAccessTableName}.user_uuid`,
            )
            .innerJoin(
                OrganizationMembershipsTableName,
                function joinCurrentOrganizationMembership() {
                    this.on(
                        `${OrganizationMembershipsTableName}.user_id`,
                        `${UserTableName}.user_id`,
                    ).andOn(
                        `${OrganizationMembershipsTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    );
                },
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .whereRaw('?? = ANY(?::uuid[])', [
                `${DocumentUserAccessTableName}.document_uuid`,
                uniqueDocumentUuids,
            ])
            .where(`${DocumentUserAccessTableName}.user_uuid`, userUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${DocumentsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .unionAll(
                trx(DocumentGroupAccessTableName)
                    .select({
                        resourceUuid: `${DocumentGroupAccessTableName}.document_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                        role: `${DocumentGroupAccessTableName}.space_role`,
                        groupUuid: `${DocumentGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        DocumentsTableName,
                        `${DocumentsTableName}.document_uuid`,
                        `${DocumentGroupAccessTableName}.document_uuid`,
                    )
                    .innerJoin(
                        SpaceTableName,
                        `${SpaceTableName}.space_id`,
                        `${DocumentsTableName}.space_id`,
                    )
                    .innerJoin(
                        ProjectTableName,
                        `${ProjectTableName}.project_id`,
                        `${SpaceTableName}.project_id`,
                    )
                    .innerJoin(
                        OrganizationTableName,
                        `${OrganizationTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    )
                    .innerJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${DocumentGroupAccessTableName}.group_uuid`,
                    )
                    .innerJoin(
                        UserTableName,
                        `${UserTableName}.user_id`,
                        `${GroupMembershipTableName}.user_id`,
                    )
                    .innerJoin(
                        OrganizationMembershipsTableName,
                        function joinCurrentOrganizationMembership() {
                            this.on(
                                `${OrganizationMembershipsTableName}.user_id`,
                                `${UserTableName}.user_id`,
                            ).andOn(
                                `${OrganizationMembershipsTableName}.organization_id`,
                                `${ProjectTableName}.organization_id`,
                            );
                        },
                    )
                    .whereRaw('?? = ANY(?::uuid[])', [
                        `${DocumentGroupAccessTableName}.document_uuid`,
                        uniqueDocumentUuids,
                    ])
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .where(
                        `${OrganizationTableName}.organization_uuid`,
                        organizationUuid,
                    )
                    .where(getActiveProjectMemberPredicate(trx))
                    .where(
                        `${GroupMembershipTableName}.organization_id`,
                        trx.ref(`${ProjectTableName}.organization_id`),
                    )
                    .where(
                        getActiveGrantedGroupPredicate(
                            trx,
                            DocumentGroupAccessTableName,
                        ),
                    )
                    .whereNull(`${DocumentsTableName}.deleted_at`)
                    .whereNull(`${SpaceTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
