export type AssessmentType = 'human' | 'llm';

export type AiEvalRunResultAssessment = {
    assessmentUuid: string;
    runResultUuid: string;
    assessmentType: AssessmentType;
    passed: boolean;
    reason: string | null;
    assessedByUserUuid: string | null;
    llmJudgeProvider: string | null;
    llmJudgeModel: string | null;
    assessedAt: Date;
    createdAt: Date;
};

export type CreateLlmAssessment = {
    runResultUuid: string;
    passed: boolean;
    reason: string | null;
    llmJudgeProvider: string;
    llmJudgeModel: string;
};
