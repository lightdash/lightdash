import { LinearClient } from './LinearClient';

const buildResponse = (data: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({ data }),
});

const customerPage = (
    nodes: Array<{ id: string; name: string; externalIds: string[] }>,
    hasNextPage = false,
    endCursor: string | null = null,
) => ({
    customers: { nodes, pageInfo: { hasNextPage, endCursor } },
});

const needsPage = (
    issues: Array<{
        id: string;
        title: string;
        description: string | null;
        labels: string[];
        state: { name: string; type: string };
    } | null>,
    hasNextPage = false,
    endCursor: string | null = null,
) => ({
    customer: {
        needs: {
            nodes: issues.map((issue) =>
                issue === null
                    ? { issue: null }
                    : {
                          issue: {
                              id: issue.id,
                              title: issue.title,
                              description: issue.description,
                              labels: {
                                  nodes: issue.labels.map((name) => ({ name })),
                              },
                              state: issue.state,
                          },
                      },
            ),
            pageInfo: { hasNextPage, endCursor },
        },
    },
});

describe('LinearClient', () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    const buildClient = (featureRequestLabel: string | null = null) =>
        new LinearClient({
            apiKey: 'lin_api_test',
            apiUrl: 'https://api.linear.app/graphql',
            featureRequestLabel,
        });

    it('paginates listCustomers across pages', async () => {
        fetchMock
            .mockResolvedValueOnce(
                buildResponse(
                    customerPage(
                        [{ id: 'c1', name: 'One', externalIds: ['org-1'] }],
                        true,
                        'cursor-1',
                    ),
                ),
            )
            .mockResolvedValueOnce(
                buildResponse(
                    customerPage([{ id: 'c2', name: 'Two', externalIds: [] }]),
                ),
            );

        const client = buildClient();
        const customers = await client.listCustomers();

        expect(customers).toEqual([
            { id: 'c1', name: 'One', externalIds: ['org-1'] },
            { id: 'c2', name: 'Two', externalIds: [] },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        // The Linear API key is sent verbatim in the Authorization header.
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
            'lin_api_test',
        );
    });

    it('returns mapped feature requests and skips null issues', async () => {
        fetchMock.mockResolvedValueOnce(
            buildResponse(
                needsPage([
                    {
                        id: 'i1',
                        title: 'Dark mode',
                        description: 'please',
                        labels: ['Feature request'],
                        state: { name: 'In Progress', type: 'started' },
                    },
                    null,
                ]),
            ),
        );

        const client = buildClient();
        const issues = await client.getCustomerFeatureRequests('c1');

        expect(issues).toEqual([
            {
                id: 'i1',
                title: 'Dark mode',
                description: 'please',
                state: { name: 'In Progress', type: 'started' },
            },
        ]);
    });

    it('filters by label when a feature-request label is configured', async () => {
        fetchMock.mockResolvedValueOnce(
            buildResponse(
                needsPage([
                    {
                        id: 'i1',
                        title: 'Keep',
                        description: null,
                        labels: ['Feature request'],
                        state: { name: 'Todo', type: 'unstarted' },
                    },
                    {
                        id: 'i2',
                        title: 'Drop',
                        description: null,
                        labels: ['Bug'],
                        state: { name: 'Todo', type: 'unstarted' },
                    },
                ]),
            ),
        );

        const client = buildClient('Feature request');
        const issues = await client.getCustomerFeatureRequests('c1');

        expect(issues.map((i) => i.id)).toEqual(['i1']);
    });

    it('returns an empty list when the customer is missing', async () => {
        fetchMock.mockResolvedValueOnce(buildResponse({ customer: null }));

        const client = buildClient();
        const issues = await client.getCustomerFeatureRequests('missing');

        expect(issues).toEqual([]);
    });

    it('throws when the API returns GraphQL errors', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ errors: [{ message: 'Bad request' }] }),
        });

        const client = buildClient();
        await expect(client.listCustomers()).rejects.toThrow('Bad request');
    });

    it('throws when the API responds with a non-ok status', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({}),
        });

        const client = buildClient();
        await expect(client.listCustomers()).rejects.toThrow('status 401');
    });
});
