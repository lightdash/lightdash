import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AGENT_ACCESS_PREVIEW_ACTIONS,
    AgentCapability,
    projectMemberAbilities,
    ProjectMemberRole,
    type MemberAbility,
} from '@lightdash/common';
import { PERSON_PERMISSION_PREVIEWS } from './personPermissionPreview';

const context = { organizationUuid: 'organization', projectUuid: 'project' };
const abilityFor = (role: ProjectMemberRole) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    projectMemberAbilities[role](
        { role, projectUuid: 'project', userUuid: 'person' },
        builder,
    );
    return builder.build();
};

test.each([
    [ProjectMemberRole.VIEWER, 'refused', 'refused'],
    [ProjectMemberRole.EDITOR, 'refused', 'allowed'],
    [ProjectMemberRole.DEVELOPER, 'allowed', 'allowed'],
    [ProjectMemberRole.ADMIN, 'allowed', 'allowed'],
] as const)('%s uses actual project role rules', (role, sql, delivery) => {
    const ability = abilityFor(role);
    expect(
        PERSON_PERMISSION_PREVIEWS.run_raw_sql(ability, context).status,
    ).toBe(sql);
    expect(
        PERSON_PERMISSION_PREVIEWS.run_saved_sql_chart(ability, context).status,
    ).toBe(sql);
    expect(
        PERSON_PERMISSION_PREVIEWS.schedule_delivery(ability, context).status,
    ).toBe(delivery);
    expect(
        PERSON_PERMISSION_PREVIEWS[`capability:${AgentCapability.RawSql}`](
            ability,
            context,
        ).status,
    ).toBe(sql);
    expect(
        PERSON_PERMISSION_PREVIEWS[
            `capability:${AgentCapability.ReadDiscover}`
        ](ability, context).status,
    ).toBe('allowed');
    expect(
        PERSON_PERMISSION_PREVIEWS.change_agent_permissions(ability, context)
            .status,
    ).toBe('refused');
});

test('checks the selected project and organization', () => {
    const ability = abilityFor(ProjectMemberRole.DEVELOPER);
    expect(
        PERSON_PERMISSION_PREVIEWS.run_raw_sql(ability, {
            ...context,
            projectUuid: 'other',
        }).status,
    ).toBe('refused');
    expect(
        PERSON_PERMISSION_PREVIEWS.run_raw_sql(ability, {
            ...context,
            projectUuid: null,
        }).status,
    ).toBe('not_checked');
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    builder.can('manage', 'Organization', {
        organizationUuid: context.organizationUuid,
    });
    expect(
        PERSON_PERMISSION_PREVIEWS.change_agent_permissions(
            builder.build(),
            context,
        ).status,
    ).toBe('allowed');
    expect(
        PERSON_PERMISSION_PREVIEWS.change_agent_permissions(builder.build(), {
            ...context,
            organizationUuid: 'other',
        }).status,
    ).toBe('refused');
});

test('never invents missing resource context, even for an admin', () => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    builder.can('manage', 'all');
    const checkable = new Set([
        'run_raw_sql',
        'schedule_delivery',
        'run_saved_sql_chart',
        'change_agent_permissions',
        `capability:${AgentCapability.RawSql}`,
        `capability:${AgentCapability.ReadDiscover}`,
    ]);
    for (const action of AGENT_ACCESS_PREVIEW_ACTIONS) {
        const result = PERSON_PERMISSION_PREVIEWS[action.id](
            builder.build(),
            context,
        );
        expect(result.status).toBe(
            checkable.has(action.id) ? 'allowed' : 'not_checked',
        );
        expect(result.message.length).toBeGreaterThan(20);
    }
});

test('names the checked prerequisite and the remaining checks', () => {
    const ability = abilityFor(ProjectMemberRole.ADMIN);
    expect(
        PERSON_PERMISSION_PREVIEWS.schedule_delivery(ability, context).message,
    ).toMatch(/content.*destination/i);
    expect(
        PERSON_PERMISSION_PREVIEWS.run_saved_sql_chart(ability, context)
            .message,
    ).toMatch(/chart.*checked/i);
    expect(
        PERSON_PERMISSION_PREVIEWS.change_dbt_files(ability, context).message,
    ).toMatch(/branch/i);
    expect(
        PERSON_PERMISSION_PREVIEWS.export_results(ability, context).message,
    ).toMatch(/format/i);
});
