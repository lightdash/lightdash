import {
    defineUserAbility,
    OrganizationMemberRole,
    type MemberAbility,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    canListLiveSources,
    canOpenProjectSettings,
    canOpenSemanticStudio,
    getStudioPermissions,
    keepsKindPage,
} from './permissions';

const ORG = 'org-uuid';
const PROJECT = 'project-uuid';

/** The real ability an organization member of this role gets. */
const abilityFor = (role: OrganizationMemberRole): MemberAbility =>
    defineUserAbility(
        {
            role,
            organizationUuid: ORG,
            userUuid: 'user-uuid',
            roleUuid: undefined,
        },
        [],
    );

describe('Semantic Layer permissions, per organization role', () => {
    it.each([
        // role, opens, dbt, virtual views, external, live, lists live, settings
        [
            OrganizationMemberRole.VIEWER,
            true,
            false,
            false,
            false,
            false,
            false,
            false,
        ],
        [
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            true,
            false,
            false,
            false,
            false,
            true,
            false,
        ],
        [
            OrganizationMemberRole.EDITOR,
            true,
            false,
            false,
            true,
            false,
            true,
            false,
        ],
        [
            OrganizationMemberRole.DEVELOPER,
            true,
            true,
            true,
            true,
            false,
            true,
            true,
        ],
        [
            OrganizationMemberRole.ADMIN,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
        ],
    ])(
        '%s: opens %s, edits dbt %s, virtual views %s, external %s, live %s; lists live %s; opens settings %s',
        (role, opens, modelled, sqlViews, files, live, listsLive, settings) => {
            const ability = abilityFor(role);
            expect(canOpenSemanticStudio(ability, ORG, PROJECT)).toBe(opens);
            expect(getStudioPermissions(ability, ORG, PROJECT)).toEqual({
                modelled,
                sqlViews,
                files,
                live,
            });
            expect(canListLiveSources(ability, ORG, PROJECT)).toBe(listsLive);
            expect(canOpenProjectSettings(ability, ORG, PROJECT)).toBe(
                settings,
            );
        },
    );

    it('opens nothing in another organization', () => {
        const ability = abilityFor(OrganizationMemberRole.ADMIN);
        expect(canOpenSemanticStudio(ability, 'other-org', PROJECT)).toBe(
            false,
        );
        expect(getStudioPermissions(ability, 'other-org', PROJECT)).toEqual({
            modelled: false,
            sqlViews: false,
            files: false,
            live: false,
        });
    });

    it('opens nothing for a member with no role', () => {
        const ability = abilityFor(OrganizationMemberRole.MEMBER);
        expect(canOpenSemanticStudio(ability, ORG, PROJECT)).toBe(false);
    });
});

describe('keepsKindPage', () => {
    const none = {
        modelled: false,
        sqlViews: false,
        files: false,
        live: false,
    };

    it('keeps the live and files pages only for those who manage them', () => {
        const live = { type: 'kind', kind: 'live' } as const;
        const files = { type: 'kind', kind: 'files' } as const;
        expect(keepsKindPage({ ...none, live: true }, live)).toBe(true);
        expect(keepsKindPage({ ...none, files: true }, files)).toBe(true);
        expect(keepsKindPage({ ...none, live: true }, files)).toBe(false);
        expect(keepsKindPage(none, live)).toBe(false);
    });

    it('never keeps other pages', () => {
        const all = { modelled: true, sqlViews: true, files: true, live: true };
        expect(keepsKindPage(all, { type: 'kind', kind: 'modelled' })).toBe(
            false,
        );
        expect(keepsKindPage(all, { type: 'source', sourceId: 'x' })).toBe(
            false,
        );
        expect(keepsKindPage(all, null)).toBe(false);
    });
});
