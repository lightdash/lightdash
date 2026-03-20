import { Knex } from 'knex';
import { SpacePermissionModel } from './SpacePermissionModel';

describe('SpacePermissionModel', () => {
    describe('getInheritanceChains', () => {
        // Regression guard: the inheritance chain query MUST use a recursive CTE
        // that walks parent_space_uuid FK pointers, NOT ltree path @> joins.
        //
        // Why: getLtreePathFromSlug() is lossy (dashes become underscores), so
        // distinct slugs like "expert-unit" and "expert_unit" produce identical
        // ltree paths. An @> join matches both spaces, causing one space's
        // inherit_parent_permissions=false to incorrectly break another space's
        // chain — hiding 100+ users from "Who has access".
        //
        // If this test fails, someone has reintroduced ltree @> joins. Use the
        // parent_space_uuid recursive CTE instead.
        it('should use recursive CTE on parent_space_uuid, not ltree @> joins', async () => {
            let capturedSql = '';
            const mockRaw = jest.fn(async (sql: string) => {
                capturedSql = sql;
                return { rows: [] };
            });
            const mockDatabase = { raw: mockRaw } as unknown as Knex;
            const model = new SpacePermissionModel(mockDatabase);

            await model.getInheritanceChains(['some-space-uuid']);

            expect(mockRaw).toHaveBeenCalledTimes(1);
            expect(capturedSql).toContain('WITH RECURSIVE');
            expect(capturedSql).toContain('parent_space_uuid');
            expect(capturedSql).not.toContain('@>');
        });
    });
});
