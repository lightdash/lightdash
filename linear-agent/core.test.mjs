import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
    branchName,
    evidenceFileName,
    evidenceMarkdown,
    evidencePreviewUrl,
    extractParentIssueIdentifier,
    extractPrompt,
    githubIssueNumberFromUrl,
    githubIssueNumbersFromUrls,
    pullRequestReferenceLines,
    semanticPullRequestTitle,
    sessionIdToVmName,
    shellQuote,
    validateTemplateVmName,
    validateLinearIssueIdentifier,
    validateVmName,
    verifyLinearWebhook,
} from './core.mjs';

const require = createRequire(import.meta.url);
const { activityFor } = require('./stream-codex-events.cjs');

test('verifies current Linear webhook signatures', () => {
    const body = Buffer.from('{"type":"AgentSessionEvent"}');
    const secret = 'test-secret';
    const now = 1_800_000_000_000;
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    assert.equal(
        verifyLinearWebhook({ body, signature, timestamp: String(now), secret, now }),
        true,
    );
    assert.equal(
        verifyLinearWebhook({ body, signature: `${signature}0`, timestamp: String(now), secret, now }),
        false,
    );
});

test('rejects stale Linear webhook signatures', () => {
    const body = Buffer.from('{}');
    const secret = 'test-secret';
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    assert.equal(
        verifyLinearWebhook({ body, signature, timestamp: '1', secret, now: 1_800_000_000_000 }),
        false,
    );
});

test('creates and validates scoped runner names', () => {
    const name = sessionIdToVmName('session-123');
    assert.match(name, /^ldlin-[a-f0-9]{12}$/);
    assert.equal(validateVmName(name), name);
    assert.throws(() => validateVmName('production'));
    assert.equal(
        validateTemplateVmName('ld-linear-agent-template'),
        'ld-linear-agent-template',
    );
    assert.throws(() => validateTemplateVmName('ldlin-123456789abc'));
});

test('extracts created and prompted session text', () => {
    assert.equal(extractPrompt({ action: 'created', promptContext: 'context' }), 'context');
    assert.equal(
        extractPrompt({ action: 'prompted', agentActivity: { body: 'follow up' } }),
        'follow up',
    );
});

test('quotes shell values and creates safe branch names', () => {
    assert.equal(shellQuote("it's"), "'it'\\''s'");
    assert.equal(branchName('ENG-123 / unsafe', 'abcdef123456'), 'linear/eng-123-unsafe-abcdef');
});

test('uses semantic pull request titles with a safe fallback', () => {
    assert.equal(
        semanticPullRequestTitle('fix(auth): enforce login attempt limits', 'Ignored'),
        'fix(auth): enforce login attempt limits',
    );
    assert.equal(
        semanticPullRequestTitle('Max login attempts', 'Max login attempts'),
        'fix: max login attempts',
    );
});

test('extracts a validated parent issue from Linear prompt context', () => {
    assert.equal(
        extractParentIssueIdentifier('<parent-issue identifier="PROD-7478">Parent</parent-issue>'),
        'PROD-7478',
    );
    assert.equal(extractParentIssueIdentifier('Mentioned PROD-7478 in prose'), null);
    assert.equal(extractParentIssueIdentifier('<parent-issue identifier="unsafe">'), null);
    assert.equal(validateLinearIssueIdentifier('prod-7478'), 'PROD-7478');
    assert.throws(() => validateLinearIssueIdentifier('not-an-issue'));
});

test('extracts only issue links for the configured GitHub repository', () => {
    assert.equal(
        githubIssueNumberFromUrl(
            'https://github.com/lightdash/lightdash/issues/22801',
            'lightdash/lightdash',
        ),
        22801,
    );
    assert.equal(
        githubIssueNumberFromUrl(
            'https://github.com/lightdash/lightdash/pull/22801',
            'lightdash/lightdash',
        ),
        null,
    );
    assert.equal(
        githubIssueNumberFromUrl(
            'https://github.com/another/repository/issues/22801',
            'lightdash/lightdash',
        ),
        null,
    );
    assert.deepEqual(
        githubIssueNumbersFromUrls(
            [
                'https://github.com/lightdash/lightdash/issues/22801',
                'https://github.com/lightdash/lightdash/issues/22801?utm_source=linear',
                'https://github.com/lightdash/lightdash/pull/123',
            ],
            'lightdash/lightdash',
        ),
        [22801],
    );
});

test('builds canonical direct and parent pull request references', () => {
    assert.deepEqual(
        pullRequestReferenceLines({
            linearIssueIdentifier: 'PROD-7478',
            githubIssueNumbers: [22802, 22802],
            parentIssueIdentifier: 'PROD-7000',
            parentGithubIssueNumbers: [22801, 22802],
        }),
        ['Closes: PROD-7478', 'Closes: #22802', 'Relates: #22801'],
    );
    assert.deepEqual(
        pullRequestReferenceLines({
            linearIssueIdentifier: 'PROD-7478',
            parentGithubIssueNumbers: [22801],
        }),
        ['Closes: PROD-7478'],
    );
});

test('creates safe evidence filenames', () => {
    assert.equal(evidenceFileName('Login lockout state', 1), 'login-lockout-state.jpg');
    assert.equal(evidenceFileName('../../', 2), 'screenshot-2.jpg');
});

test('builds evidence details with a verified preview URL and reproduction steps', () => {
    assert.equal(
        evidencePreviewUrl(
            'https://preview.example',
            '/projects/demo/dashboards/orders?parameters=%7B%22region%22%3A%22EU%22%7D',
        ),
        'https://preview.example/projects/demo/dashboards/orders' +
            '?parameters=%7B%22region%22%3A%22EU%22%7D',
    );
    assert.equal(evidencePreviewUrl('https://preview.example', '//other.example/path'), null);
    assert.equal(evidencePreviewUrl('https://preview.example', '/\\other.example/path'), null);
    assert.equal(
        evidenceMarkdown(
            {
                description: 'The dashboard shows the EU parameter value.',
                url: 'https://agent.example/evidence.jpg',
                relativeUrl: '/projects/demo/dashboards/orders?parameters=eu',
                steps: [
                    'Open the dashboard parameters menu.',
                    'Set Region to EU and confirm the dashboard updates.',
                ],
            },
            'https://preview.example',
        ),
        `![The dashboard shows the EU parameter value.](https://agent.example/evidence.jpg)

_The dashboard shows the EU parameter value._

**Verified URL:** <https://preview.example/projects/demo/dashboards/orders?parameters=eu>

**Reproduction steps**

1. Open the dashboard parameters menu.
2. Set Region to EU and confirm the dashboard updates.`,
    );
    assert.equal(
        evidenceMarkdown(
            {
                description: 'Legacy evidence remains readable.',
                url: 'https://agent.example/legacy.jpg',
            },
            null,
        ),
        `![Legacy evidence remains readable.](https://agent.example/legacy.jpg)

_Legacy evidence remains readable._`,
    );
    assert.equal(
        evidenceMarkdown(
            {
                description: 'The dashboard should show the selected parameter.',
                relativeUrl: '/projects/demo/dashboards/orders',
                steps: [
                    'Open the dashboard parameters menu.',
                    'Select a parameter value and confirm the dashboard updates.',
                ],
            },
            'https://preview.example',
        ),
        `> It was not possible to generate the image.

_The dashboard should show the selected parameter._

**Verified URL:** <https://preview.example/projects/demo/dashboards/orders>

**Reproduction steps**

1. Open the dashboard parameters menu.
2. Select a parameter value and confirm the dashboard updates.`,
    );
});

test('maps Codex reasoning and commands to Linear activities', () => {
    assert.deepEqual(
        activityFor({
            type: 'item.completed',
            item: { type: 'reasoning', text: 'Checking the authentication flow.' },
        }),
        { type: 'thought', body: 'Checking the authentication flow.' },
    );
    const command = activityFor({
        type: 'item.completed',
        item: {
            type: 'command_execution',
            command: 'curl -H "Authorization: Bearer secret-value" /health',
            aggregated_output: 'ok',
            exit_code: 0,
        },
    });
    assert.equal(command.type, 'action');
    assert.equal(command.action, 'Ran command');
    assert.doesNotMatch(command.parameter, /secret-value/);
    assert.match(command.result, /exit 0/);
});
