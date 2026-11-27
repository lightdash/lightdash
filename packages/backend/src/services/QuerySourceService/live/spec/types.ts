import { type ApiConnectorType } from '@lightdash/common';

/**
 * How much of a question the tool's API answers by itself: 5 runs SQL,
 * 4 runs its own query language, 3 runs reports from a fixed menu,
 * 2 filters records with no totals, 1 lists records with no filtering.
 */
export type LiveIntegrationLevel = 1 | 2 | 3 | 4 | 5;

/** Where a tester gets real data; `unknown` when no way is known. */
export type LiveAuthTestWith =
    | 'test_account'
    | 'real_account'
    | 'paid_account'
    | 'unknown';

/** What a tester must provide beyond a password; `invite` is someone with access adding them. */
export type LiveAuthNeed =
    | 'gmail'
    | 'phone'
    | 'invite'
    | 'card'
    | 'real_person'
    | 'vendor_approval'
    | 'sales_contract';

type LiveUseCaseBase = {
    /** Stable: test results are kept against it. */
    id: string;
    /** Whether the integration can answer it today. */
    possible: boolean;
};

/** A question people expect to ask, for agents to test the integration with. */
export type LiveUseCaseQuestion = LiveUseCaseBase & { question: string };

/** A tile of a dashboard people expect to build. */
export type LiveUseCaseChart = LiveUseCaseBase & {
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

/** A budget of calls that refills when its window ends. */
export type LiveRateLimitBucket = {
    /** Stable: usage is kept against it. */
    id: string;
    /** Shown in refusals and on usage pages, e.g. "per hour". */
    label: string;
    windowMs: number;
    capacity: number;
};

/**
 * One integration's rate limits, as data. The rate-limit gate charges every
 * bucket on every call, spaces calls by `callsPerSecond`, and caps calls in
 * flight at `concurrentCalls`.
 */
export type LiveRateLimits = {
    /** Calls one connection may have in flight at once. */
    concurrentCalls: number;
    /** Even spacing between calls; null when the vendor has no per-second limit. */
    callsPerSecond: number | null;
    buckets: readonly LiveRateLimitBucket[];
    /** Only for something a reader must know that the numbers can't say. */
    note?: string;
    /** Shown to admins with the limits they can lower; unlike `note`, written for customers. */
    cardNote?: string;
};

/**
 * What an integration's code can't know about the tool it calls, written
 * into its definition. Prose sections carry a `description`; rate limits
 * are numbers, with a `note` only when the numbers can't say it.
 */
export type LiveIntegrationKind = 'reports' | 'records' | 'sql';

export type LiveIntegrationSpec = {
    /**
     * How much the API answers by itself: 5 runs SQL, 4 its own query
     * language, 3 reports from a fixed menu, 2 filters records but has no
     * totals, 1 only lists records.
     */
    level: { value: LiveIntegrationLevel; description: string };
    /**
     * How Integrations 2.0 answers it: `reports` when the API computes
     * totals at a grain, `records` when it returns rows, `sql` when it runs a
     * query language. Nothing reads it yet.
     */
    kind: LiveIntegrationKind;
    /**
     * How hard access is, for testers and for customers connecting.
     * Token and OAuth are separate ways in.
     */
    auth: {
        /** What the vendor must review or approve, if anything. */
        description: string;
        testWith: LiveAuthTestWith;
        needs: [LiveAuthNeed, ...LiveAuthNeed[]];
        /**
         * The ways in the vendor offers, whatever the integration's
         * `checkAuth` accepts today: a token or key a customer creates and
         * pastes, and OAuth sign-in with or without a vendor review.
         */
        token: boolean;
        oauth: 'none' | 'no_review' | 'needs_review';
    };
    /** How the vendor's API pages results and where it stops. */
    paging: { description: string };
    /** The vendor's rate limits, as limits one connection stays under. */
    rateLimits: LiveRateLimits;
    /** What people expect to ask it and build with it, and whether each is possible today. */
    useCases: LiveUseCases;
};
