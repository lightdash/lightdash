import { type ApiConnectorType } from '@lightdash/common';

/**
 * How much of a question the tool's API answers by itself: 5 runs SQL,
 * 4 runs its own query language, 3 runs reports from a fixed menu,
 * 2 filters records with no totals, 1 lists records with no filtering.
 */
export type LiveIntegrationLevel = 1 | 2 | 3 | 4 | 5;

export type LiveAuthTestWith =
    | 'test_account'
    | 'our_account'
    | 'paid_account'
    | 'cant_test';

export type LiveAuthNeed =
    | 'gmail'
    | 'phone'
    | 'someone_adds_us'
    | 'card'
    | 'real_person'
    | 'vendor_approval'
    | 'sales_contract';

/**
 * - `answer`: answerable today
 * - `needs_change`: the API could answer it, but the integration needs a change
 * - `api_cant`: the tool's live API can't give it; only ingestion would
 */
export type LiveUseCaseExpect = 'answer' | 'needs_change' | 'api_cant';

/**
 * - `unverified`: no test run confirmed `expect`; it is read from the code
 * - `no_data`: the test accounts were too empty to check
 * - `capped`: right only while the records read stay under the row limit
 */
export type LiveUseCaseTag = 'unverified' | 'no_data' | 'capped';

type LiveUseCaseVerdict = {
    /** Stable: test results are kept against it. */
    id: string;
    expect: LiveUseCaseExpect;
    /** What answers it today, or what stands in the way. */
    why: string;
    tags?: LiveUseCaseTag[];
};

/** A question people expect to ask, for agents to test the integration with. */
export type LiveUseCaseQuestion = LiveUseCaseVerdict & { question: string };

/** A tile of a dashboard people expect to build. */
export type LiveUseCaseChart = LiveUseCaseVerdict & {
    title: string;
    detail: string;
};

export type LiveUseCaseDashboard = {
    id: string;
    name: string;
    /** Who opens it, and what for. */
    purpose: string;
    charts: LiveUseCaseChart[];
};

export type LiveUseCases = {
    questions: LiveUseCaseQuestion[];
    dashboards: LiveUseCaseDashboard[];
};

/** Several tools, or a tool joined to the company's warehouse. */
type LiveUseCaseTools = { tools: (ApiConnectorType | 'warehouse')[] };

export type LiveCrossToolUseCases = {
    questions: (LiveUseCaseQuestion & LiveUseCaseTools)[];
    dashboards: (LiveUseCaseDashboard & LiveUseCaseTools)[];
};

/**
 * What an integration's code can't know about the tool it calls. Each
 * section's `description` explains the reasoning in plain words.
 */
export type LiveIntegrationSpec = {
    /**
     * How much the API answers by itself: 5 runs SQL, 4 its own query
     * language, 3 reports from a fixed menu, 2 filters records but has no
     * totals, 1 only lists records.
     */
    level: { value: LiveIntegrationLevel; description: string };
    /**
     * How hard access is, for us to test and for customers to connect.
     * Token and OAuth are separate ways in.
     */
    auth: {
        description: string;
        testWith: LiveAuthTestWith;
        needs: [LiveAuthNeed, ...LiveAuthNeed[]];
        /** A customer can create a token or key and paste it. */
        token: boolean;
        oauth: 'none' | 'no_review' | 'needs_review';
    };
    /**
     * What the vendor's API caps, and why the integration's own limits sit
     * where they do. One entry per kind of limit.
     */
    limits: {
        /** How results page and where they stop. */
        paging: { description: string };
        /** Calls per second, minute or day. */
        rateLimiting: { description: string };
    };
};
