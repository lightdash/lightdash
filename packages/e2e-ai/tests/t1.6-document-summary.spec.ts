import { z } from 'zod';
import { agentsPath } from '../lib/agents';
import { resultsOf } from '../lib/api';
import { single } from '../lib/assert';
import { markUndone, recordUndo } from '../lib/cleanupLedger';
import { queryRows } from '../lib/db';
import { runId } from '../lib/env';
import { RETURN_POLICY_DOCUMENT } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { explainFromLog, markUsageLog } from '../lib/usageLog';

// Plan T1.6. Deterministic: a stored fallback summary means the model call
// failed. Preconditions: F1, F7. With E2E_AI_BACKEND_LOG set, a fallback
// failure quotes the backend's own error.

// DocumentSummarySchema (documentSummaryGenerator.ts), as stored.
const documentSummarySchema = z.object({
    description: z.string().min(1).max(600),
    definedTerms: z.array(z.string().min(1).max(60)).max(30),
    relatedExploreNames: z.array(z.string().min(1)).max(20),
    useWhen: z.string().min(1).max(400),
    relevance: z.enum(['high', 'medium', 'low', 'none']),
    warning: z.string().nullable(),
});

// Copied from createFallbackDocumentSummary: the marker in its description.
const FALLBACK_MARKER = 'An automatic summary could not be generated.';

test('T1.6 Document summary on upload', async ({ api, db, f1Agent }) => {
    const documentsPath = `${agentsPath}/${f1Agent.uuid}/documents`;
    const name = `e2e-ai-${runId} return policy definitions`;

    const mark = await markUsageLog();
    const reply = await api.send('POST', documentsPath, {
        name,
        originalFilename: 'return-policy-definitions.md',
        mimeType: 'text/markdown',
        content: RETURN_POLICY_DOCUMENT,
    });
    expect(reply.status, reply.text).toBe(201);
    const document = resultsOf(reply, z.object({ uuid: z.string() }));
    const documentPath = `${documentsPath}/${document.uuid}`;
    const undo = recordUndo({
        kind: 'http',
        method: 'DELETE',
        path: documentPath,
    });

    // Documents are organisation rows shared with agents through
    // ai_agent_document_access, so deleting the agent does not remove them.
    try {
        const row = single(
            await queryRows(
                db,
                'SELECT summary FROM ai_agent_document WHERE ai_agent_document_uuid = $1',
                [document.uuid],
                z.object({ summary: documentSummarySchema }),
            ),
            'ai_agent_document row',
        );
        if (row.summary.description.includes(FALLBACK_MARKER)) {
            throw new Error(
                `The fallback summary was stored, so the model call failed. ${await explainFromLog(
                    mark,
                    [`Failed to generate summary for document "${name}"`],
                )}`,
            );
        }
    } finally {
        await api.delete(documentPath);
        markUndone(undo);
    }
});
