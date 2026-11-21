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

/**
 * What an integration's code can't know about the tool it calls, written
 * into its definition. Each section's `description` explains the reasoning.
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
    /** How the vendor's API pages results and where it stops. */
    paging: { description: string };
    /** The vendor's rate limits, and why the integration's own sit where they do. */
    rateLimiting: { description: string };
    /** What people expect to ask it and build with it, and whether each is possible today. */
    useCases: LiveUseCases;
};
