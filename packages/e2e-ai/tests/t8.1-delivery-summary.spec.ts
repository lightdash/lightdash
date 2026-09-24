import { SEED_ORG_1, SEED_ORG_1_ADMIN } from '@lightdash/common';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool } from 'pg';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { single } from '../lib/assert';
import { markUndone, recordUndo } from '../lib/cleanupLedger';
import { queryRows } from '../lib/db';
import { mailpitUrl, optInEnabled, runId } from '../lib/env';
import { expect, test } from '../lib/fixtures';
import { reportObservation, reportSkippedCheck } from '../lib/report';
import {
    equals,
    expectUsageLine,
    markUsageLog,
    present,
    usageValue,
    witnessUsageOrReportGap,
} from '../lib/usageLog';

// Plan T8.1 (O). Deterministic on the partial-failure flag. The delivery goes
// to one email address on a reserved domain, so it only lands somewhere
// readable when the backend mails through a capture inbox; with
// E2E_AI_MAILPIT_URL set the message text is checked too. The scheduler is
// created disabled, so it never fires on its cron, and is deleted after.
// Missing usage attribution is a reported gap, not a failure: the feature
// works, only its cost attribution is not logged.

const DASHBOARD = 'Jaffle dashboard';
// Replaced by the AI-written report unless augmentation fails.
const STORED_MESSAGE = `e2e stored message ${runId}`;
const RECIPIENT = `e2e-ai-${runId}@example.com`;
// A delivery no worker has started by then has no scheduler to run it.
const START_WINDOW_MS = 60_000;

const logRowSchema = z.object({
    task: z.string(),
    job_id: z.string(),
    status: z.enum(['scheduled', 'started', 'completed', 'error']),
    details: z
        .looseObject({
            partialFailures: z
                .array(z.looseObject({ type: z.string() }))
                .optional(),
            error: z.string().optional(),
        })
        .nullable(),
});

/** Latest status of every job in the delivery's group. */
const readJobs = (db: Pool, jobId: string) =>
    queryRows(
        db,
        `SELECT DISTINCT ON (task, job_id) task, job_id, status, details
         FROM scheduler_log WHERE job_group = $1 OR job_id = $1
         ORDER BY task, job_id, created_at DESC`,
        [jobId],
        logRowSchema,
    );

// Error details can carry a whole HTML error page.
const summarizeDetails = (details: unknown) =>
    JSON.stringify(details).slice(0, 500);

const isTerminal = (status: string) =>
    status === 'completed' || status === 'error';

/** Waits until the delivery and every email it sends are terminal. */
const awaitDelivery = async (db: Pool, jobId: string) => {
    const sentAt = Date.now();
    for (;;) {
        const jobs = await readJobs(db, jobId);
        const delivery = jobs.find(
            (job) => job.task === 'handleScheduledDelivery',
        );
        const emails = jobs.filter(
            (job) => job.task === 'sendEmailNotification',
        );
        if (
            delivery !== undefined &&
            isTerminal(delivery.status) &&
            emails.every((job) => isTerminal(job.status))
        ) {
            return { delivery, emails };
        }
        if (
            (delivery === undefined || delivery.status === 'scheduled') &&
            Date.now() - sentAt > START_WINDOW_MS
        ) {
            throw new Error(
                `No scheduler worker started the delivery within ${START_WINDOW_MS / 1000} s`,
            );
        }
        await sleep(1_000);
    }
};

const mailpitSchema = z.object({
    messages: z.array(z.object({ ID: z.string() })),
});

/** The delivery email's text from Mailpit, polled until it arrives. */
const readCapturedEmail = async (baseUrl: string) => {
    const search = `${baseUrl}/api/v1/search?query=${encodeURIComponent(`to:${RECIPIENT}`)}`;
    let found: z.output<typeof mailpitSchema>['messages'] = [];
    await expect
        .poll(
            async () => {
                found = mailpitSchema.parse(
                    await (await fetch(search)).json(),
                ).messages;
                return found.length;
            },
            { message: `delivery email to ${RECIPIENT} in Mailpit` },
        )
        .toBeGreaterThan(0);
    const { ID } = single(found, `Mailpit message to ${RECIPIENT}`);
    const message = z
        .object({ Text: z.string(), HTML: z.string() })
        .parse(await (await fetch(`${baseUrl}/api/v1/message/${ID}`)).json());
    return { id: ID, text: `${message.Text}\n${message.HTML}` };
};

test.skip(
    !optInEnabled,
    'opt-in (O): set E2E_AI_OPT_IN=1 once deliveries can send email (a capture inbox such as Mailpit makes the message readable)',
);

test('T8.1 Delivery summary on send-now', async ({ api, db }) => {
    const dashboards = await api.get(
        `/api/v1/projects/${projectUuid}/dashboards`,
        z.array(z.object({ uuid: z.string(), name: z.string() })),
    );
    const dashboard = single(
        dashboards.filter(({ name }) => name === DASHBOARD),
        `seeded dashboard "${DASHBOARD}"`,
    );
    const { schedulerUuid } = await api.post(
        `/api/v1/dashboards/${dashboard.uuid}/schedulers`,
        {
            name: `e2e-ai delivery ${runId}`,
            message: STORED_MESSAGE,
            cron: '59 23 * * *',
            timezone: 'UTC',
            // Not image: that logs a headless browser in through
            // INTERNAL_LIGHTDASH_HOST (SITE_URL by default), which may point
            // at a host the backend cannot reach. The summary is the same.
            format: 'csv',
            options: {},
            targets: [{ recipient: RECIPIENT }],
            enabled: false,
            includeLinks: true,
            appUuid: null,
            appName: null,
        },
        z.object({ schedulerUuid: z.string() }),
    );
    const schedulerPath = `/api/v1/schedulers/${schedulerUuid}`;
    const undo = recordUndo({
        kind: 'http',
        method: 'DELETE',
        path: schedulerPath,
    });
    try {
        await api.put(
            `${schedulerPath}/ai-augmentation`,
            {
                type: 'fast_model',
                prompt: 'Summarise the main numbers on this dashboard in two sentences.',
            },
            z.unknown(),
        );
        const mark = await markUsageLog();
        const { jobId } = await api.post(
            `${schedulerPath}/send`,
            {},
            z.object({ jobId: z.string() }),
        );
        const { delivery, emails } = await awaitDelivery(db, jobId);
        expect(
            delivery.status,
            `delivery ${summarizeDetails(delivery.details)}`,
        ).toBe('completed');
        const aiFailures = (delivery.details?.partialFailures ?? []).filter(
            (failure) => failure.type === 'ai_augmentation',
        );
        expect(aiFailures, 'AI augmentation partial failures').toEqual([]);
        expect(emails.length, 'email jobs').toBeGreaterThan(0);
        emails.forEach((email) =>
            expect(
                email.status,
                `email ${summarizeDetails(email.details)}`,
            ).toBe('completed'),
        );

        // The inbox is the proof the model ran; the log only attributes it.
        if (mailpitUrl === null) {
            reportSkippedCheck(
                'message text',
                'E2E_AI_MAILPIT_URL is unset, so the delivered message cannot be read',
            );
        } else {
            const email = await readCapturedEmail(mailpitUrl);
            expect(email.text, 'the stored message was replaced').not.toContain(
                STORED_MESSAGE,
            );
            reportObservation(
                `delivery email ${email.id} carries the AI message`,
            );
        }

        await witnessUsageOrReportGap(
            mark,
            'delivery summary attribution',
            (usage) => usageValue(usage, 'feature') === 'delivery-summary',
            (lines) =>
                expectUsageLine(single(lines, 'delivery-summary usage line'), {
                    functionId: equals('generateDeliverySummary'),
                    organizationId: equals(SEED_ORG_1.organization_uuid),
                    projectId: equals(projectUuid),
                    userId: equals(SEED_ORG_1_ADMIN.user_uuid),
                    model: present,
                }),
            'no ai.usage line, because AiService.generateDeliverySummary never calls emitAiUsage, so delivery summaries are missing from cost attribution. This check becomes an assertion as soon as it does.',
        );
    } finally {
        await api.delete(schedulerPath);
        markUndone(undo);
    }
});
