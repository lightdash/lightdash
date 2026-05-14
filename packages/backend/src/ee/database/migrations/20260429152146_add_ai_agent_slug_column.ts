import { generateSlug } from '@lightdash/common';
import { Knex } from 'knex';

const AiAgentTableName = 'ai_agent';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(AiAgentTableName, 'slug')) return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.text('slug').nullable();
    });

    const agents = await knex(AiAgentTableName)
        .orderBy('ai_agent_uuid')
        .select<
            { ai_agent_uuid: string; project_uuid: string; name: string }[]
        >('ai_agent_uuid', 'project_uuid', 'name');

    const usedSlugsByProject = new Map<string, Set<string>>();
    const updates: { uuid: string; slug: string }[] = [];

    for (const agent of agents) {
        const baseSlug = generateSlug(agent.name);
        const used =
            usedSlugsByProject.get(agent.project_uuid) ?? new Set<string>();
        let slug = baseSlug;
        let inc = 0;
        while (used.has(slug)) {
            inc += 1;
            slug = `${baseSlug}-${inc}`;
        }
        used.add(slug);
        usedSlugsByProject.set(agent.project_uuid, used);
        updates.push({ uuid: agent.ai_agent_uuid, slug });
    }

    await Promise.all(
        updates.map(({ uuid, slug }) =>
            knex(AiAgentTableName)
                .where({ ai_agent_uuid: uuid })
                .update({ slug, updated_at: knex.raw('updated_at') }),
        ),
    );

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.text('slug').notNullable().alter();
        table.unique(['project_uuid', 'slug']);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(AiAgentTableName, 'slug'))) return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.dropUnique(['project_uuid', 'slug']);
        table.dropColumn('slug');
    });
}
