import { ProjectType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { AiAgentDocumentModel } from '../../../models/AiAgentDocumentModel';
import * as createDocumentTables from '../20260518124758_add_ai_agent_document';
import * as addAlwaysIncludeInContext from '../20260710100000_add_always_include_in_context_to_ai_agent_document';

/**
 * Which knowledge documents reach an agent, asked of PostgreSQL. The unit
 * tests pin the SQL the model writes; a predicate joined or bound wrongly
 * reads the same there and returns other documents here. Trainees hold the
 * knowledge-document scopes in their training copy only because an agent in
 * a Learn training project or copy never reaches organization documents.
 *
 * The document tables are the real migrations. The tables they reference
 * are stand-ins with the columns the model reads, in a schema of their own
 * that is rolled back.
 */
describe('Knowledge documents an agent reaches, on PostgreSQL', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: AiAgentDocumentModel;
    let organizationUuid: string;

    const PROJECT_KINDS = {
        real: { type: ProjectType.DEFAULT, source: null },
        previewOfReal: { type: ProjectType.PREVIEW, source: null },
        playground: { type: ProjectType.DEFAULT, source: 'playground' },
        training: { type: ProjectType.TRAINING, source: 'training' },
        trainingCopy: { type: ProjectType.PREVIEW, source: 'training' },
    } as const;
    type ProjectKind = keyof typeof PROJECT_KINDS;
    const kinds = Object.keys(PROJECT_KINDS) as ProjectKind[];
    const ordinary: ProjectKind[] = ['real', 'previewOfReal', 'playground'];
    const learn: ProjectKind[] = ['training', 'trainingCopy'];
    let projects: Record<ProjectKind, { project: string; agent: string }>;
    const documents = new Map<string, string>();

    const createDocument = async (
        name: string,
        projectUuid: string | null,
        agentUuids: string[],
        organization = organizationUuid,
    ) => {
        const document = await model.create({
            organizationUuid: organization,
            projectUuid,
            name,
            originalFilename: `${name}.md`,
            mimeType: 'text/markdown',
            content: `Content of ${name}`,
            summary: {
                description: name,
                definedTerms: [],
                relatedExploreNames: [],
                useWhen: '',
                relevance: 'high',
                warning: null,
            },
            storageKey: `test/${randomUUID()}.md`,
            agentUuids,
            createdByUserUuid: null,
        });
        documents.set(name, document.uuid);
    };

    const scopeOf = (kind: ProjectKind) => ({
        organizationUuid,
        agentUuid: projects[kind].agent,
        projectUuid: projects[kind].project,
    });
    const listed = async (kind: ProjectKind) =>
        (await model.findAllForAgent(scopeOf(kind)))
            .map((document) => document.name)
            .sort();

    beforeAll(() => {
        if (!process.env.PGCONNECTIONURI && !process.env.PGDATABASE)
            throw new Error('PostgreSQL integration connection is required');
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        const schema = `agent_document_scope_${randomUUID().replaceAll('-', '')}`;
        await transaction.raw('CREATE SCHEMA ??', [schema]);
        await transaction.raw('SET LOCAL search_path TO ??, public', [schema]);
        await transaction.schema.createTable('organizations', (t) => {
            t.uuid('organization_uuid').primary();
        });
        await transaction.schema.createTable('users', (t) => {
            t.uuid('user_uuid').primary();
        });
        await transaction.schema.createTable('projects', (t) => {
            t.uuid('project_uuid').primary();
            t.text('project_type').notNullable();
            t.text('provisioning_source').nullable();
        });
        await transaction.schema.createTable('ai_agent', (t) => {
            t.uuid('ai_agent_uuid').primary();
            t.uuid('project_uuid').notNullable();
        });
        await createDocumentTables.up(transaction);
        await addAlwaysIncludeInContext.up(transaction);
        model = new AiAgentDocumentModel({ database: transaction });

        organizationUuid = randomUUID();
        const otherOrganizationUuid = randomUUID();
        await transaction<{ organization_uuid: string }>(
            'organizations',
        ).insert([
            { organization_uuid: organizationUuid },
            { organization_uuid: otherOrganizationUuid },
        ]);
        projects = Object.fromEntries(
            kinds.map((kind) => [
                kind,
                { project: randomUUID(), agent: randomUUID() },
            ]),
        ) as typeof projects;
        await transaction<{
            project_uuid: string;
            project_type: string;
            provisioning_source: string | null;
        }>('projects').insert(
            kinds.map((kind) => ({
                project_uuid: projects[kind].project,
                project_type: PROJECT_KINDS[kind].type,
                provisioning_source: PROJECT_KINDS[kind].source,
            })),
        );
        await transaction<{ ai_agent_uuid: string; project_uuid: string }>(
            'ai_agent',
        ).insert(
            kinds.map((kind) => ({
                ai_agent_uuid: projects[kind].agent,
                project_uuid: projects[kind].project,
            })),
        );

        documents.clear();
        await createDocument('organization', null, []);
        await createDocument(
            'organization, granted to every agent',
            null,
            kinds.map((kind) => projects[kind].agent),
        );
        await createDocument(
            'another organization',
            null,
            [],
            otherOrganizationUuid,
        );
        // eslint-disable-next-line no-restricted-syntax
        for (const kind of kinds) {
            // eslint-disable-next-line no-await-in-loop
            await createDocument(`${kind}, granted`, projects[kind].project, [
                projects[kind].agent,
            ]);
            // eslint-disable-next-line no-await-in-loop
            await createDocument(
                `${kind}, not granted`,
                projects[kind].project,
                [],
            );
        }
    });

    afterEach(async () => {
        if (transaction && !transaction.isCompleted())
            await transaction.rollback();
    });

    afterAll(async () => {
        await database?.destroy();
    });

    it.each(ordinary)(
        'gives an agent in a %s project the organization documents and its own granted ones',
        async (kind) => {
            expect(await listed(kind)).toEqual(
                [
                    `${kind}, granted`,
                    'organization',
                    'organization, granted to every agent',
                ].sort(),
            );
        },
    );

    it.each(learn)(
        'gives an agent in a %s project only that project’s granted documents',
        async (kind) => {
            expect(await listed(kind)).toEqual([`${kind}, granted`]);
        },
    );

    it.each(kinds)(
        'loads the same documents into the chat context of a %s agent as it lists',
        async (kind) => {
            const context = await model.findAllContextForAgent(scopeOf(kind));
            expect(context.map((document) => document.name).sort()).toEqual(
                await listed(kind),
            );
        },
    );

    it.each(learn)(
        'does not open an organization document by id through a %s agent, granted or not',
        async (kind) => {
            // eslint-disable-next-line no-restricted-syntax
            for (const name of [
                'organization',
                'organization, granted to every agent',
            ]) {
                const lookup = {
                    ...scopeOf(kind),
                    documentUuid: documents.get(name)!,
                };
                expect(
                    // eslint-disable-next-line no-await-in-loop
                    await model.findAccessibleForAgent(lookup),
                ).toBeUndefined();
                expect(
                    // eslint-disable-next-line no-await-in-loop
                    await model.getContentForAgent(lookup),
                ).toBeUndefined();
            }
        },
    );

    it('still opens an organization document by id through an ordinary agent', async () => {
        const lookup = {
            ...scopeOf('real'),
            documentUuid: documents.get('organization')!,
        };
        expect((await model.findAccessibleForAgent(lookup))?.name).toBe(
            'organization',
        );
        expect((await model.getContentForAgent(lookup))?.content).toBe(
            'Content of organization',
        );
    });

    it.each(kinds)(
        'knows whether a %s project is a Learn one',
        async (kind) => {
            expect(await model.isTrainingProject(projects[kind].project)).toBe(
                learn.includes(kind),
            );
        },
    );
});
