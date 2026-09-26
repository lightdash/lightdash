import { z } from 'zod';
import { single } from '../lib/assert';
import { queryRows } from '../lib/db';
import { expect, test } from '../lib/fixtures';
import { isFeatureFlagEnabled } from '../lib/flags';
import { ensurePlayground } from '../lib/playground';

// Plan T6.3. Deterministic, no model call. Preconditions: F5, whose ensure
// needs the new-onboarding feature flag (read first) and an organization that
// had no project, so the seed org skips. NOT YET VERIFIED LIVE.

const THREAD_TITLE = 'Why returns rose in the spring';

test('T6.3 Seeded finished research renders', async ({ page, api, db }) => {
    test.skip(
        !(await isFeatureFlagEnabled(api, 'new-onboarding')),
        'playground projects are off: the F5 ensure needs the new-onboarding feature flag',
    );
    // F5: idempotent, reused across runs, never deleted.
    const playground = await ensurePlayground(api, db);
    const seeded = single(
        await queryRows(
            db,
            `SELECT t.ai_thread_uuid, t.agent_uuid, r.ai_deep_research_run_uuid,
                    r.result_markdown
             FROM ai_thread t
             JOIN ai_deep_research_runs r ON r.ai_thread_uuid = t.ai_thread_uuid
             WHERE t.project_uuid = $1 AND t.title = $2
               AND r.status = 'completed'`,
            [playground.projectUuid, THREAD_TITLE],
            z.object({
                ai_thread_uuid: z.string(),
                agent_uuid: z.string(),
                ai_deep_research_run_uuid: z.string(),
                result_markdown: z.string().min(1),
            }),
        ),
        `seeded "${THREAD_TITLE}" run`,
    );

    await page.goto(
        `/projects/${playground.projectUuid}/ai-agents/${seeded.agent_uuid}/threads/${seeded.ai_thread_uuid}`,
    );
    const open = page.locator('[data-tour-anchor="research-report-open"]');
    await expect(open, 'report card').toBeVisible();
    await open.click();
    await page.waitForURL(
        new RegExp(
            `/ai-agents/deep-research/${seeded.ai_deep_research_run_uuid}`,
        ),
    );
    await expect(
        page.getByRole('button', { name: 'Back to chat' }),
    ).toBeVisible();
    // The seeded report opens with this heading.
    await expect(
        page.getByRole('heading', { name: THREAD_TITLE }).first(),
    ).toBeVisible();
});
