import {
    PullRequestProvider,
    PullRequestSource,
    type KnexPaginatedData,
    type PullRequest,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import KnexPaginate from '../database/pagination';
import { PullRequestsModel } from './PullRequestsModel';

jest.mock('../database/pagination', () => ({
    __esModule: true,
    default: { paginate: jest.fn() },
}));

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const USER_UUID = '00000000-0000-0000-0000-000000000003';
const PULL_REQUEST_UUID = '00000000-0000-0000-0000-000000000004';
const AI_THREAD_UUID = '00000000-0000-0000-0000-000000000005';
const AI_AGENT_UUID = '00000000-0000-0000-0000-000000000006';
const REVIEW_THREAD_UUID = '00000000-0000-0000-0000-000000000007';
const REVIEW_PROJECT_UUID = '00000000-0000-0000-0000-000000000008';
const REVIEW_AGENT_UUID = '00000000-0000-0000-0000-000000000009';
const FINDING_UUID = '00000000-0000-0000-0000-000000000010';
const CREATED_AT = new Date('2026-06-10T10:00:00.000Z');
const FINGERPRINT = 'ai_agent_review_item:fingerprint';
const PR_URL = 'https://github.com/acme/dbt/pull/42';

const mockedPaginate = jest.mocked(KnexPaginate.paginate);

const makePullRequestRow = (
    overrides: Partial<Record<string, unknown>> = {},
) => ({
    pull_request_uuid: PULL_REQUEST_UUID,
    organization_uuid: ORGANIZATION_UUID,
    project_uuid: PROJECT_UUID,
    created_by_user_uuid: USER_UUID,
    provider: PullRequestProvider.GITHUB,
    source: PullRequestSource.AI_AGENT,
    owner: 'acme',
    repo: 'dbt',
    pr_number: 42,
    pr_url: PR_URL,
    created_at: CREATED_AT,
    ...overrides,
});

describe('PullRequestsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new PullRequestsModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        mockedPaginate.mockReset();
        jest.restoreAllMocks();
    });

    it('enriches pull requests with persisted review remediation context', async () => {
        mockedPaginate.mockResolvedValue({
            data: [makePullRequestRow()],
            pagination: {
                page: 1,
                pageSize: 25,
                totalPageCount: 1,
                totalResults: 1,
            },
        } as unknown as KnexPaginatedData<PullRequest[]>);

        Object.assign(model as unknown as Record<string, unknown>, {
            aiWritebackTableExists: true,
            aiReviewTablesExist: true,
        });

        tracker.on.select('ai_writeback_thread').responseOnce([
            {
                pull_request_uuid: PULL_REQUEST_UUID,
                ai_thread_uuid: AI_THREAD_UUID,
                agent_uuid: AI_AGENT_UUID,
            },
        ]);
        tracker.on.select('ai_agent_review_remediation').responseOnce([
            {
                pullRequestUuid: PULL_REQUEST_UUID,
                fingerprint: FINGERPRINT,
                reviewStatus: 'in_progress',
                reviewItemTitle: 'Fix revenue metric guidance',
                primaryRootCause: 'semantic_layer',
                sourceFindingUuid: FINDING_UUID,
                sourceThreadUuid: REVIEW_THREAD_UUID,
                sourceProjectUuid: REVIEW_PROJECT_UUID,
                sourceAgentUuid: REVIEW_AGENT_UUID,
            },
        ]);
        tracker.on.select('ai_agent_review_item').responseOnce([]);

        const result = await model.getByProject(PROJECT_UUID, {
            page: 1,
            pageSize: 25,
        });

        expect(result.data[0]).toMatchObject({
            pullRequestUuid: PULL_REQUEST_UUID,
            aiThreadUuid: AI_THREAD_UUID,
            aiAgentUuid: AI_AGENT_UUID,
            reviewContext: {
                reviewItemUuid: FINGERPRINT,
                reviewItemFingerprint: FINGERPRINT,
                reviewTitle: 'Fix revenue metric guidance',
                reviewStatus: 'in_progress',
                primaryRootCause: 'semantic_layer',
                sourceFindingUuid: FINDING_UUID,
                sourceThreadUuid: REVIEW_THREAD_UUID,
                sourceProjectUuid: REVIEW_PROJECT_UUID,
                sourceAgentUuid: REVIEW_AGENT_UUID,
            },
        });
    });

    it('falls back to linked_pr_url for older review rows without a remediation link', async () => {
        mockedPaginate.mockResolvedValue({
            data: [makePullRequestRow()],
            pagination: {
                page: 1,
                pageSize: 25,
                totalPageCount: 1,
                totalResults: 1,
            },
        } as unknown as KnexPaginatedData<PullRequest[]>);

        Object.assign(model as unknown as Record<string, unknown>, {
            aiWritebackTableExists: true,
            aiReviewTablesExist: true,
        });

        tracker.on.select('ai_writeback_thread').responseOnce([]);
        tracker.on.select('ai_agent_review_remediation').responseOnce([]);
        tracker.on.select('ai_agent_review_item').responseOnce([
            {
                fingerprint: FINGERPRINT,
                linkedPrUrl: PR_URL,
                reviewStatus: 'resolved',
            },
        ]);
        tracker.on.select('ai_agent_review_turn_signal').responseOnce([
            {
                fingerprint: FINGERPRINT,
                reviewItemTitle: 'Document revenue definition',
                primaryRootCause: 'project_context',
                sourceFindingUuid: FINDING_UUID,
                sourceThreadUuid: REVIEW_THREAD_UUID,
                sourceProjectUuid: REVIEW_PROJECT_UUID,
                sourceAgentUuid: REVIEW_AGENT_UUID,
            },
        ]);

        const result = await model.getByProject(PROJECT_UUID, {
            page: 1,
            pageSize: 25,
        });

        expect(result.data[0]).toMatchObject({
            pullRequestUuid: PULL_REQUEST_UUID,
            aiThreadUuid: null,
            aiAgentUuid: null,
            reviewContext: {
                reviewItemUuid: FINGERPRINT,
                reviewItemFingerprint: FINGERPRINT,
                reviewTitle: 'Document revenue definition',
                reviewStatus: 'resolved',
                primaryRootCause: 'project_context',
                sourceFindingUuid: FINDING_UUID,
                sourceThreadUuid: REVIEW_THREAD_UUID,
                sourceProjectUuid: REVIEW_PROJECT_UUID,
                sourceAgentUuid: REVIEW_AGENT_UUID,
            },
        });
    });
});
