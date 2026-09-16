import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync('.github/workflows/pr.yml', 'utf8');
const setup = readFileSync(
    '.github/workflows/_setup_node_pnpm_cypress/action.yml',
    'utf8',
);
const previewRef = '${{ github.event.pull_request.head.sha || github.sha }}';

const getJob = (name) => {
    const job = workflow.split(`\n  ${name}:\n`)[1];
    assert.ok(job, `Missing job: ${name}`);
    return job.split(/\n  [\w-]+:\n/)[0];
};

const getStep = (job, action) => {
    const step = job
        .split(/\n      - /)
        .find((entry) => entry.includes(`uses: ${action}`));
    assert.ok(step, `Missing action: ${action}`);
    return step;
};

test('preview tests and their image use the deployed PR head, not the merge revision', () => {
    for (const name of [
        'build-cypress-e2e-image',
        'api-tests',
        'app-tests',
        'timezone-tests',
        'cli-tests-without-dbt',
        'cli-tests',
        'cli-dbt-tests',
    ]) {
        const job = getJob(name);
        assert.ok(
            getStep(job, 'actions/checkout@').includes(`ref: ${previewRef}`),
            `${name} must check out the deployed PR head`,
        );
    }
});

test('Cypress setup preserves the revision chosen by its caller', () => {
    assert.doesNotMatch(setup, /uses:\s*actions\/checkout@/);
});

test('preview workflow changes select a fresh preview and frontend E2E run', () => {
    const filters = readFileSync('.github/file-filters.yml', 'utf8');
    for (const name of ['preview', 'frontend']) {
        const filter = filters.split(`\n${name}:\n`)[1]?.split(/\n\S/)[0];
        assert.ok(filter, `Missing filter: ${name}`);
        for (const path of [
            '.github/workflows/pr.yml',
            '.github/workflows/_setup_node_pnpm_cypress/action.yml',
        ]) {
            assert.ok(
                filter.includes(`"${path}"`),
                `${name} must select ${path}`,
            );
        }
    }
});
