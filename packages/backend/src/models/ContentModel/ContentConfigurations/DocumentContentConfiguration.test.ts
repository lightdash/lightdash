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

    it('includes enabled Documents and deleted Documents but excludes dashboard owner filters', () => {
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
        ).toBe(false);
        expect(
            documentContentConfiguration.shouldQueryBeIncluded({
                ...filters,
                contentTypes: [ContentType.CHART],
            }),
        ).toBe(false);
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
