import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { buildProjectTree, type Project } from './model';
import { useProjectSearch } from './useSemanticStudio';

vi.mock('../../api');

const project: Project = {
    id: 'project',
    name: 'Shop',
    warehouse: { type: 'postgres', label: 'PostgreSQL' },
    sources: [
        {
            id: 'warehouse',
            kind: 'modelled',
            type: 'dbt',
            name: 'Shop',
            origin: '',
            onWarehouse: true,
            status: null,
            settingsPath: null,
        },
        {
            id: 'leads',
            kind: 'files',
            type: 'csv',
            name: 'Leads',
            origin: 'CSV upload',
            onWarehouse: false,
            status: null,
            settingsPath: null,
        },
        {
            id: 'posthog',
            kind: 'live',
            type: 'live',
            name: 'PostHog',
            origin: 'Live data source',
            onWarehouse: false,
            status: null,
            settingsPath: null,
        },
    ],
    explores: [
        { id: 'orders', sourceId: 'warehouse' },
        { id: 'leads_csv', sourceId: 'leads' },
        { id: 'posthog_events', sourceId: 'posthog' },
    ].map((explore) => ({
        ...explore,
        name: explore.id,
        label: explore.id,
        groupPath: [],
        description: '',
        warnings: [],
    })),
};

/** A compiled explore with one dimension on its base table. */
const compiled = (name: string, field: string, label: string) => ({
    name,
    label: name,
    baseTable: name,
    joinedTables: [],
    tables: {
        [name]: {
            name,
            label: name,
            dimensions: {
                [field]: {
                    fieldType: 'dimension',
                    type: 'string',
                    name: field,
                    label,
                    table: name,
                    hidden: false,
                },
            },
            metrics: {},
        },
    },
});

const explores: Record<string, unknown> = {
    leads_csv: compiled('leads_csv', 'signup_email', 'Signup email'),
    posthog_events: compiled('posthog_events', 'email_domain', 'Email domain'),
};

const wrapper = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};

describe('useProjectSearch', () => {
    beforeEach(() => {
        mockedLightdashApi.mockReset();
        mockedLightdashApi.mockImplementation(
            async ({ url }: { url: string }) => {
                if (url.startsWith('/projects/project/dataCatalog')) {
                    const search = new URL(url, 'http://x').searchParams.get(
                        'search',
                    );
                    if (!search || !'customer_email'.includes(search)) {
                        return [];
                    }
                    return [
                        {
                            type: 'field',
                            name: 'customer_email',
                            label: 'Customer email',
                            tableName: 'orders',
                            fieldType: 'dimension',
                        },
                    ];
                }
                const explore = /\/explores\/(.+)$/.exec(url)?.[1];
                if (explore && explore in explores) return explores[explore];
                throw new Error(`Unexpected ${url}`);
            },
        );
    });

    it('finds fields from the catalog, external sources and live data sources', async () => {
        const { result } = renderHook(
            () => useProjectSearch(project, buildProjectTree(project)),
            { wrapper: wrapper() },
        );
        act(() => result.current.setSearch('email'));

        await waitFor(() =>
            expect(
                result.current.results.results.map(({ label }) => label),
            ).toEqual(['Customer email', 'Signup email', 'Email domain']),
        );
        expect(result.current.results.results.map(({ ref }) => ref)).toEqual([
            {
                type: 'field',
                exploreId: 'orders',
                fieldId: 'orders_customer_email',
            },
            {
                type: 'field',
                exploreId: 'leads_csv',
                fieldId: 'leads_csv_signup_email',
            },
            {
                type: 'field',
                exploreId: 'posthog_events',
                fieldId: 'posthog_events_email_domain',
            },
        ]);
        await waitFor(() =>
            expect(result.current.isSearchingFields).toBe(false),
        );
        // Warehouse explores come from the catalog, never loaded one by one.
        const urls = mockedLightdashApi.mock.calls.map(([{ url }]) => url);
        expect(urls).not.toContain('/projects/project/explores/orders');
    });

    it('keeps the other sources when one explore fails to load', async () => {
        delete explores.leads_csv;
        const { result } = renderHook(
            () => useProjectSearch(project, buildProjectTree(project)),
            { wrapper: wrapper() },
        );
        act(() => result.current.setSearch('domain'));

        await waitFor(() =>
            expect(
                result.current.results.results.map(({ label }) => label),
            ).toEqual(['Email domain']),
        );
    });

    it('loads no source explores for a one-letter search', async () => {
        const { result } = renderHook(
            () => useProjectSearch(project, buildProjectTree(project)),
            { wrapper: wrapper() },
        );
        act(() => result.current.setSearch('e'));
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(mockedLightdashApi).not.toHaveBeenCalled();
    });
});
