import { SEED_ORG_1 } from '@lightdash/common';
import { z } from 'zod';
import { agentPath, projectUuid } from '../lib/agents';
import { single } from '../lib/assert';
import { expect, test } from '../lib/fixtures';
import { reportObservation, reportSkippedCheck } from '../lib/report';
import {
    equals,
    expectUsageLine,
    markUsageLog,
    usageValue,
    witnessUsage,
} from '../lib/usageLog';
import {
    explainQuestionJobFailure,
    makeChartArtifactOrRetry,
    missingEmbeddingReason,
    requireVerification,
    verifyAndAwaitJobs,
} from '../lib/verifiedArtifacts';

// Plan T3.1. Deterministic once an artifact exists; making one is V (no chart
// artifact once is variance). Preconditions: AI_EMBEDDING_ENABLED=true on the
// backend, which gates verification itself (probed through the product's own
// gate); an embedding-capable default embedding provider for the embedding.

test('T3.1 Verify an artifact: embedding job and artifact question job', async ({
    api,
    db,
    f1Agent,
}) => {
    await requireVerification(api, f1Agent);

    // The plan's "T2.3 artifact", made here so the test runs on its own.
    const artifact = await makeChartArtifactOrRetry(api, db, f1Agent, () =>
        reportObservation(
            'no chart artifact on attempt 1 (variance); retrying once',
        ),
    );

    const mark = await markUsageLog();
    const row = await verifyAndAwaitJobs(api, db, f1Agent, artifact);

    await test.step('question job', async () => {
        const question = row.verified_question;
        if (question === null) {
            throw new Error(
                `The question job finished without writing a question. ${await explainQuestionJobFailure(mark)}`,
            );
        }
        expect(question.trim().length, 'verified_question').toBeGreaterThan(0);
        expect(question.length, 'verified_question length').toBeLessThanOrEqual(
            200,
        );
        const questions = await api.get(
            `${agentPath(f1Agent)}/verified-questions`,
            z.array(z.object({ question: z.string(), uuid: z.string() })),
        );
        expect(questions.map((entry) => entry.question)).toContain(question);
    });

    await test.step('embedding job', async () => {
        if (!row.has_embedding) {
            reportSkippedCheck(
                'embedding half',
                await missingEmbeddingReason(mark, row),
            );
            return;
        }
        expect(row.embedding_model, 'embedding_model').toBeTruthy();
        expect(
            row.embedding_model_provider,
            'embedding_model_provider',
        ).toBeTruthy();
        await witnessUsage(
            mark,
            'embedding attribution',
            (line) =>
                usageValue(line, 'feature') === 'embedding' &&
                usageValue(line, 'projectId') === projectUuid,
            (lines) =>
                expectUsageLine(single(lines, 'embedding AI usage line'), {
                    organizationId: equals(SEED_ORG_1.organization_uuid),
                    projectId: equals(projectUuid),
                }),
        );
    });
});
