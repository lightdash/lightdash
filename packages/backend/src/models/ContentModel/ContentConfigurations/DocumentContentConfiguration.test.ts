import { ContentType } from '@lightdash/common';
import knex from 'knex';
import { documentContentConfiguration } from './DocumentContentConfiguration';
import { spaceContentConfiguration } from './SpaceContentConfiguration';

const database = knex({ client: 'pg' });
const spaceUuid = '00000000-0000-0000-0000-000000000001';
const documentUuid = '00000000-0000-0000-0000-000000000002';

describe('Document content discovery', () => {
    it('is excluded without server-resolved visibility even when explicitly requested', () => {
        expect(documentContentConfiguration.shouldQueryBeIncluded({})).toBe(
            false,
        );
        expect(
            documentContentConfiguration.shouldQueryBeIncluded({
                contentTypes: [ContentType.DOCUMENT],
            }),
        ).toBe(false);
    });

    it('includes enabled, deleted and owner-filtered Documents', () => {
        const filters = { documents: { allowedSpaceUuids: [spaceUuid] } };
        expect(
            documentContentConfiguration.shouldQueryBeIncluded(filters),
        ).toBe(true);
        expect(
            documentContentConfiguration.shouldQueryBeIncluded({
                ...filters,
                deleted: true,
            }),
        ).toBe(true);
        expect(
            documentContentConfiguration.shouldQueryBeIncluded({
                ...filters,
                ownerUserUuids: ['owner'],
            }),
        ).toBe(true);
        expect(
            documentContentConfiguration.shouldQueryBeIncluded({
                ...filters,
                contentTypes: [ContentType.CHART],
            }),
        ).toBe(false);
    });

    it('filters by assigned owner and projects the owner', () => {
        const ownerUuid = '00000000-0000-0000-0000-000000000003';
        const query = documentContentConfiguration
            .getSummaryQuery(database, {
                documents: { allowedSpaceUuids: [spaceUuid] },
                ownerUserUuids: [ownerUuid],
            })
            .toSQL();
        expect(query.sql).toContain(
            '"documents"."document_owner_user_uuid" in (?)',
        );
        expect(query.bindings).toContain(ownerUuid);
        expect(query.sql).toContain('"owner_email"."is_primary" = ?');
        const row = documentContentConfiguration.convertSummaryRow({
            content_type: ContentType.DOCUMENT,
            owner_user_uuid: ownerUuid,
            owner_user_first_name: 'Ada',
            owner_user_last_name: 'Lovelace',
            owner_user_email: 'ada@example.com',
        } as Parameters<
            typeof documentContentConfiguration.convertSummaryRow
        >[0]);
        expect(row).toMatchObject({
            owner: {
                userUuid: ownerUuid,
                firstName: 'Ada',
                lastName: 'Lovelace',
                email: 'ada@example.com',
            },
        });
    });

    it('projects metadata only and scopes before pagination to authorized Spaces', () => {
        const query = documentContentConfiguration
            .getSummaryQuery(database, {
                documents: { allowedSpaceUuids: [spaceUuid] },
                projectUuids: ['project'],
                search: 'quarterly review',
            })
            .toSQL();
        expect(query.sql).toContain('"spaces"."space_uuid" in (?)');
        expect(query.bindings).toContain(spaceUuid);
        expect(query.sql).toContain('"documents"."deleted_at" is null');
        expect(query.sql).toContain('"spaces"."deleted_at" is null');
        expect(query.sql).toContain('max(version_number)');
        expect(query.sql).not.toMatch(/latest\.content|"content"/);
        expect(query.bindings).toContain('%quarterly review%');
    });

    it('groups inherited and direct access without widening explicit project, Space or UUID filters', () => {
        const query = documentContentConfiguration
            .getSummaryQuery(database, {
                projectUuids: ['project'],
                spaceUuids: ['requested-space'],
                uuids: ['requested-document'],
                documents: {
                    allowedSpaceUuids: [spaceUuid],
                    grantedUuids: [documentUuid],
                },
            })
            .toSQL();
        expect(query.sql).toContain(
            '("spaces"."space_uuid" in (?) or "documents"."document_uuid" in (?))',
        );
        expect(query.bindings).toEqual(
            expect.arrayContaining([
                'project',
                'requested-space',
                'requested-document',
                spaceUuid,
                documentUuid,
            ]),
        );
        expect(query.sql).not.toContain('union');
    });

    it('uses only grant UUIDs for Shared with me without requiring access to the owning Space', () => {
        const query = documentContentConfiguration
            .getSummaryQuery(database, {
                documents: {
                    allowedSpaceUuids: [],
                    grantedUuids: [documentUuid],
                },
                sharedWithMe: true,
                uuids: [documentUuid],
            })
            .toSQL();
        expect(query.sql).toContain('"documents"."document_uuid" in (?)');
        expect(query.bindings).toContain(documentUuid);
        expect(query.sql).not.toContain('"spaces"."space_uuid" in');
        expect(
            documentContentConfiguration
                .getSummaryQuery(database, {
                    documents: { allowedSpaceUuids: [] },
                    sharedWithMe: true,
                })
                .toSQL().bindings,
        ).toContain(0);
    });

    it('returns zero Document counts when disabled or no Space is authorized', () => {
        for (const documents of [undefined, { allowedSpaceUuids: [] }]) {
            const query = spaceContentConfiguration
                .getSummaryQuery(database, { documents })
                .toSQL();
            expect(query.sql).toContain("'documentCount', ?");
            expect(query.bindings).toContain(0);
            expect(query.sql).not.toContain('from "documents"');
        }
    });

    it('counts only nondeleted Documents in Document-authorized Spaces', () => {
        const query = spaceContentConfiguration
            .getSummaryQuery(database, {
                documents: { allowedSpaceUuids: [spaceUuid] },
            })
            .toSQL();
        expect(query.sql).toContain('from "documents"');
        expect(query.sql).toContain('"documents"."deleted_at" is null');
        expect(query.bindings).toContain(spaceUuid);
    });
});
