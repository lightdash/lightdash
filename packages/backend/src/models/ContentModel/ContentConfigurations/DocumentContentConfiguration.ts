import { ContentType, DocumentContentItem } from '@lightdash/common';
import {
    ContentConfiguration,
    ContentTypePriority,
} from '../ContentModelTypes';
import { applyContentNameSearch } from '../ContentSearchUtils';

export const documentContentConfiguration: ContentConfiguration = {
    shouldQueryBeIncluded: (filters) =>
        filters.documents !== undefined &&
        (!filters.contentTypes ||
            filters.contentTypes.includes(ContentType.DOCUMENT)),
    getSummaryQuery: (knex, filters) =>
        knex('documents')
            .leftJoin(
                'pinned_document',
                'pinned_document.document_uuid',
                'documents.document_uuid',
            )
            .leftJoin('spaces', 'spaces.space_id', 'documents.space_id')
            .innerJoin(
                'projects',
                'projects.project_uuid',
                'documents.project_uuid',
            )
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .leftJoin(
                'users as creator',
                'creator.user_uuid',
                'documents.created_by_user_uuid',
            )
            .leftJoin('document_versions as latest', function latestVersion() {
                this.on(
                    'latest.document_id',
                    '=',
                    'documents.document_id',
                ).andOn(
                    'latest.version_number',
                    '=',
                    knex.raw(
                        '(select max(version_number) from document_versions where document_id = documents.document_id)',
                    ),
                );
            })
            .leftJoin(
                'users as deleted_by_user',
                'deleted_by_user.user_uuid',
                'documents.deleted_by_user_uuid',
            )
            .leftJoin(
                'users as updater',
                'updater.user_uuid',
                'latest.created_by_user_uuid',
            )
            .leftJoin(
                'users as owner_user',
                'owner_user.user_uuid',
                'documents.document_owner_user_uuid',
            )
            .leftJoin('emails as owner_email', function ownerEmail() {
                this.on(
                    'owner_email.user_id',
                    '=',
                    'owner_user.user_id',
                ).andOnVal('owner_email.is_primary', true);
            })
            .leftJoin('content_verification', function verificationJoin() {
                this.on(
                    'content_verification.content_uuid',
                    '=',
                    'documents.document_uuid',
                ).andOnVal(
                    'content_verification.content_type',
                    ContentType.DOCUMENT,
                );
            })
            .leftJoin(
                'users as verified_by_user',
                'verified_by_user.user_uuid',
                'content_verification.verified_by_user_uuid',
            )
            .select([
                knex.raw('? as content_type', [ContentType.DOCUMENT]),
                knex.raw('?::integer as content_type_rank', [
                    ContentTypePriority.DOCUMENT,
                ]),
                knex.raw('documents.document_uuid::text as uuid'),
                'documents.name',
                'documents.description',
                'documents.slug',
                'spaces.space_uuid',
                'spaces.name as space_name',
                'projects.project_uuid',
                'projects.name as project_name',
                'organizations.organization_uuid',
                'organizations.organization_name',
                'pinned_document.pinned_list_uuid',
                knex.raw('documents.created_at::timestamp as created_at'),
                'creator.user_uuid as created_by_user_uuid',
                'creator.first_name as created_by_user_first_name',
                'creator.last_name as created_by_user_last_name',
                knex.raw('documents.updated_at::timestamp as last_updated_at'),
                'updater.user_uuid as last_updated_by_user_uuid',
                'updater.first_name as last_updated_by_user_first_name',
                'updater.last_name as last_updated_by_user_last_name',
                knex.raw('0::integer as views'),
                knex.raw('null::timestamp as first_viewed_at'),
                knex.raw('null::timestamp as last_viewed_at'),
                knex.raw('documents.deleted_at::timestamp as deleted_at'),
                'documents.deleted_by_user_uuid',
                'deleted_by_user.first_name as deleted_by_user_first_name',
                'deleted_by_user.last_name as deleted_by_user_last_name',
                knex.raw(
                    'content_verification.verified_at::timestamp as verified_at',
                ),
                'verified_by_user.user_uuid as verified_by_user_uuid',
                'verified_by_user.first_name as verified_by_user_first_name',
                'verified_by_user.last_name as verified_by_user_last_name',
                'documents.document_owner_user_uuid as owner_user_uuid',
                'owner_user.first_name as owner_user_first_name',
                'owner_user.last_name as owner_user_last_name',
                'owner_email.email as owner_user_email',
                knex.raw("'{}'::json as metadata"),
            ])
            .whereNull('spaces.deleted_at')
            .where((builder) => {
                if (filters.deleted) {
                    void builder.whereNotNull('documents.deleted_at');
                    if (filters.deletedByUserUuids) {
                        void builder.whereIn(
                            'documents.deleted_by_user_uuid',
                            filters.deletedByUserUuids,
                        );
                    }
                } else {
                    void builder.whereNull('documents.deleted_at');
                }
                if (filters.projectUuids) {
                    void builder.whereIn(
                        'documents.project_uuid',
                        filters.projectUuids,
                    );
                }
                if (filters.uuids) {
                    void builder.whereIn(
                        'documents.document_uuid',
                        filters.uuids,
                    );
                }
                if (filters.ownerUserUuids) {
                    void builder.whereIn(
                        'documents.document_owner_user_uuid',
                        filters.ownerUserUuids,
                    );
                }
                if (filters.spaceUuids) {
                    void builder.whereIn(
                        'spaces.space_uuid',
                        filters.spaceUuids,
                    );
                }
                if (!filters.deleted && !filters.sharedWithMe) {
                    const personal = filters.documents?.personal;
                    void builder.where((visibility) => {
                        void visibility
                            .whereIn(
                                'spaces.space_uuid',
                                filters.documents?.allowedSpaceUuids ?? [],
                            )
                            .orWhereIn(
                                'documents.document_uuid',
                                filters.documents?.grantedUuids ?? [],
                            );
                        if (personal) {
                            void visibility.orWhere((personalDocuments) => {
                                void personalDocuments
                                    .whereNull('documents.space_id')
                                    .where((viewer) => {
                                        void viewer
                                            .where(
                                                'documents.created_by_user_uuid',
                                                personal.forUserUuid,
                                            )
                                            .orWhereIn(
                                                'documents.project_uuid',
                                                personal.adminProjectUuids,
                                            );
                                    });
                            });
                        }
                    });
                } else if (!filters.deleted) {
                    void builder.whereIn(
                        'documents.document_uuid',
                        filters.documents?.grantedUuids ?? [],
                    );
                }
                if (filters.search) {
                    applyContentNameSearch(
                        builder,
                        'documents.name',
                        filters.search,
                    );
                }
            }),
    shouldRowBeConverted: (value): value is typeof value =>
        value.content_type === ContentType.DOCUMENT,
    convertSummaryRow: (value): DocumentContentItem => ({
        contentType: ContentType.DOCUMENT,
        directAccessRoles: [],
        uuid: value.uuid,
        name: value.name,
        description: value.description,
        slug: value.slug,
        createdAt: value.created_at,
        createdBy: value.created_by_user_uuid
            ? {
                  uuid: value.created_by_user_uuid,
                  firstName: value.created_by_user_first_name ?? '',
                  lastName: value.created_by_user_last_name ?? '',
              }
            : null,
        lastUpdatedAt: value.last_updated_at,
        lastUpdatedBy: value.last_updated_by_user_uuid
            ? {
                  uuid: value.last_updated_by_user_uuid,
                  firstName: value.last_updated_by_user_first_name ?? '',
                  lastName: value.last_updated_by_user_last_name ?? '',
              }
            : null,
        project: { uuid: value.project_uuid, name: value.project_name },
        organization: {
            uuid: value.organization_uuid,
            name: value.organization_name,
        },
        space: value.space_uuid
            ? { uuid: value.space_uuid, name: value.space_name }
            : null,
        pinnedList: value.pinned_list_uuid
            ? { uuid: value.pinned_list_uuid }
            : null,
        views: 0,
        firstViewedAt: null,
        lastViewedAt: null,
        verification:
            value.verified_at !== null &&
            value.verified_by_user_uuid !== null &&
            value.verified_by_user_first_name !== null &&
            value.verified_by_user_last_name !== null
                ? {
                      verifiedBy: {
                          userUuid: value.verified_by_user_uuid,
                          firstName: value.verified_by_user_first_name,
                          lastName: value.verified_by_user_last_name,
                      },
                      verifiedAt: value.verified_at,
                  }
                : null,
        owner: value.owner_user_uuid
            ? {
                  userUuid: value.owner_user_uuid,
                  firstName: value.owner_user_first_name ?? '',
                  lastName: value.owner_user_last_name ?? '',
                  email: value.owner_user_email,
              }
            : null,
    }),
};
