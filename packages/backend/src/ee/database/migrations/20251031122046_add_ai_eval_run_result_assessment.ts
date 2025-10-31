import { Knex } from 'knex';

const aiEvalRunResultAssessmentTable = 'ai_eval_run_result_assessment';
const aiEvalRunResultTable = 'ai_eval_run_result';
const aiEvalPromptTable = 'ai_eval_prompt';
const usersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiEvalPromptTable, (table) => {
        table.text('expected_response').nullable();
    });

    await knex.schema.createTable(aiEvalRunResultAssessmentTable, (table) => {
        table
            .uuid('ai_eval_run_result_assessment_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_eval_run_result_uuid')
            .notNullable()
            .references('ai_eval_run_result_uuid')
            .inTable(aiEvalRunResultTable)
            .onDelete('CASCADE');
        table
            .enum('assessment_type', ['human', 'llm'])
            .notNullable()
            .defaultTo('llm');
        table.boolean('passed').notNullable();
        table.text('reason');
        table
            .uuid('assessed_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('SET NULL');
        table.string('llm_judge_provider', 50);
        table.string('llm_judge_model', 100);
        table
            .timestamp('assessed_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        // Unique constraint: one assessment per result per type (max one human + one llm)
        table.unique(['ai_eval_run_result_uuid', 'assessment_type']);

        table.index(['ai_eval_run_result_uuid']);
        table.index(['assessment_type']);
        table.index(['assessed_by_user_uuid']);
        table.index(['llm_judge_model']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(aiEvalRunResultAssessmentTable);
    await knex.schema.alterTable(aiEvalPromptTable, (table) => {
        table.dropColumn('expected_response');
    });
}
