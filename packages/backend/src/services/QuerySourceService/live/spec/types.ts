import { type ApiConnectorType } from '@lightdash/common';

/**
 * How much of a question the tool's API answers by itself: 5 runs SQL,
 * 4 runs its own query language, 3 runs reports from a fixed menu,
 * 2 filters records with no totals, 1 lists records with no filtering.
 */
export type LiveIntegrationLevel = 1 | 2 | 3 | 4 | 5;

/** Where a tester gets real data. */
export type LiveAuthTestWith =
    | 'test_account'
    | 'our_account'
    | 'paid_account'
    | 'cant_test';

/** What a person must provide, beyond a password, to get access. */
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
export type LiveSpecExpect = 'answer' | 'needs_change' | 'api_cant';

/**
 * - `unverified`: no test run confirmed `expect`; it is read from the code
 * - `no_data`: the test accounts were too empty to check
 * - `capped`: right only while the records read stay under the row limit
 */
export type LiveSpecTag = 'unverified' | 'no_data' | 'capped';

type LiveSpecVerdict = {
    /** Stable: test results are kept against it. */
    id: string;
    expect: LiveSpecExpect;
    tags?: LiveSpecTag[];
};

/** A question people expect to ask, for agents to test the integration with. */
export type LiveSpecQuestion = LiveSpecVerdict & { question: string };

/** A tile of a dashboard people expect to build. */
export type LiveSpecChart = LiveSpecVerdict & { title: string; detail: string };

export type LiveSpecDashboard = {
    id: string;
    name: string;
    charts: LiveSpecChart[];
};

/** Several tools, or a tool joined to the company's warehouse. */
type LiveSpecTools = { tools: (ApiConnectorType | 'warehouse')[] };

export type LiveCrossToolSpec = {
    questions: (LiveSpecQuestion & LiveSpecTools)[];
    dashboards: (LiveSpecDashboard & LiveSpecTools)[];
};

/** What an integration's code can't know about it. */
export type LiveIntegrationSpec = {
    level: LiveIntegrationLevel;
    auth: {
        testWith: LiveAuthTestWith;
        needs: [LiveAuthNeed, ...LiveAuthNeed[]];
        /** What the vendor must review before customers can sign in; null when nothing. */
        oauthReview: string | null;
    };
    /** The vendor's API, as its docs describe it. */
    api: {
        description: string;
        /** Whether the API totals by itself, which sets `level`. */
        serverSideTotals: string;
        vendorLimit: string;
        paging: string;
        /** Why the integration's own rate limits sit where they do. */
        whyOurLimits: string;
    };
    questions: LiveSpecQuestion[];
    dashboards: LiveSpecDashboard[];
};
