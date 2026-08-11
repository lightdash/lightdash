import { Knex } from 'knex';

const OrganizationDesignsTableName = 'organization_designs';
const SlugSequenceName = 'organization_designs_slug_sequence';
const SlugUniqueConstraint =
    'organization_designs_organization_uuid_slug_unique';
const SlugFormatConstraint = 'organization_designs_slug_format_check';
const MaxSlugLength = 255;
const UuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const slugifyName = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`CREATE SEQUENCE IF NOT EXISTS ${SlugSequenceName}`);

    await knex.schema.alterTable(OrganizationDesignsTableName, (table) => {
        table
            .text('slug')
            .nullable()
            .defaultTo(
                knex.raw(`'design-' || nextval('${SlugSequenceName}')::text`),
            );
    });

    const designs = await knex(OrganizationDesignsTableName)
        .select('design_uuid', 'organization_uuid', 'name')
        .orderBy('organization_uuid')
        .orderBy('created_at')
        .orderBy('design_uuid');

    const slugsByOrganization = new Map<string, Set<string>>();
    /* eslint-disable no-await-in-loop */
    for (const design of designs) {
        const organizationSlugs =
            slugsByOrganization.get(design.organization_uuid) ??
            new Set<string>();
        slugsByOrganization.set(design.organization_uuid, organizationSlugs);

        const generatedBase = slugifyName(design.name).slice(0, MaxSlugLength);
        const baseSlug =
            !generatedBase || UuidPattern.test(generatedBase)
                ? `design-${design.design_uuid}`
                : generatedBase;
        let slug = baseSlug;
        let suffix = 1;
        while (organizationSlugs.has(slug)) {
            const suffixText = `-${suffix}`;
            slug = `${baseSlug.slice(
                0,
                MaxSlugLength - suffixText.length,
            )}${suffixText}`;
            suffix += 1;
        }
        organizationSlugs.add(slug);

        await knex(OrganizationDesignsTableName)
            .where('design_uuid', design.design_uuid)
            .update({ slug });
    }
    /* eslint-enable no-await-in-loop */

    await knex.raw(`
        ALTER TABLE ${OrganizationDesignsTableName}
        ALTER COLUMN slug SET NOT NULL
    `);
    await knex.raw(`
        ALTER TABLE ${OrganizationDesignsTableName}
        ADD CONSTRAINT ${SlugFormatConstraint}
        CHECK (
            CHAR_LENGTH(slug) <= ${MaxSlugLength}
            AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
            AND slug !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        )
    `);
    await knex.schema.alterTable(OrganizationDesignsTableName, (table) => {
        table.unique(['organization_uuid', 'slug'], {
            indexName: SlugUniqueConstraint,
        });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationDesignsTableName, (table) => {
        table.dropUnique(['organization_uuid', 'slug'], SlugUniqueConstraint);
        table.dropChecks(SlugFormatConstraint);
        table.dropColumn('slug');
    });
    await knex.raw(`DROP SEQUENCE IF EXISTS ${SlugSequenceName}`);
}
