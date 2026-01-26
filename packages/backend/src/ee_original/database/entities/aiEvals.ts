import { Knex } from 'knex';

export const AiEvalTableName = 'ai_eval';

export type DbAiEval = {
    ai_eval_uuid: string;
    agent_uuid: string;
    title: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
    created_by_user_uuid: string;
};

export type AiEvalTable = Knex.CompositeTableType<
    DbAiEval,
    Omit<DbAiEval, 'ai_eval_uuid' | 'created_at' | 'updated_at'>,
    Partial<Omit<DbAiEval, 'ai_eval_uuid' | 'created_at' | 'updated_at'>> & {
        updated_at: Knex.Raw;
    }
>;

export const AiEvalPromptTableName = 'ai_eval_prompt';

export type DbAiEvalPrompt = {
    ai_eval_prompt_uuid: string;
    ai_eval_uuid: string;
    prompt: string | null;
    ai_prompt_uuid: string | null;
    ai_thread_uuid: string | null;
    expected_response: string | null;
    created_at: Date;
};

export type AiEvalPromptTable = Knex.CompositeTableType<
    DbAiEvalPrompt,
    Omit<DbAiEvalPrompt, 'ai_eval_prompt_uuid' | 'created_at'>,
    never
>;

export const AiEvalRunTableName = 'ai_eval_run';

export type DbAiEvalRun = {
    ai_eval_run_uuid: string;
    ai_eval_uuid: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    completed_at: Date | null;
    created_at: Date;
};

export type AiEvalRunTable = Knex.CompositeTableType<
    DbAiEvalRun,
    Omit<
        DbAiEvalRun,
        'ai_eval_run_uuid' | 'created_at' | 'completed_at' | 'status'
    >,
    Partial<Pick<DbAiEvalRun, 'status' | 'completed_at'>>
>;

export const AiEvalRunResultTableName = 'ai_eval_run_result';

export type DbAiEvalRunResult = {
    ai_eval_run_result_uuid: string;
    ai_eval_run_uuid: string;
    ai_eval_prompt_uuid: string | null;
    ai_thread_uuid: string | null;
    status: 'pending' | 'running' | 'completed' | 'assessing' | 'failed';
    error_message: string | null;
    completed_at: Date | null;
    created_at: Date;
};

export type AiEvalRunResultTable = Knex.CompositeTableType<
    DbAiEvalRunResult,
    Pick<
        DbAiEvalRunResult,
        'ai_eval_run_uuid' | 'ai_eval_prompt_uuid' | 'ai_thread_uuid'
    >,
    Partial<
        Pick<
            DbAiEvalRunResult,
            'ai_thread_uuid' | 'status' | 'error_message' | 'completed_at'
        >
    >
>;

export const AiEvalRunResultAssessmentTableName =
    'ai_eval_run_result_assessment';

export type DbAiEvalRunResultAssessment = {
    ai_eval_run_result_assessment_uuid: string;
    ai_eval_run_result_uuid: string;
    assessment_type: 'human' | 'llm';
    passed: boolean;
    reason: string | null;
    assessed_by_user_uuid: string | null;
    llm_judge_provider: string | null;
    llm_judge_model: string | null;
    assessed_at: Date;
    created_at: Date;
};

export type AiEvalRunResultAssessmentTable = Knex.CompositeTableType<
    DbAiEvalRunResultAssessment,
    Omit<
        DbAiEvalRunResultAssessment,
        'ai_eval_run_result_assessment_uuid' | 'created_at' | 'assessed_at'
    >,
    never
>;
