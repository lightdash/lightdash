import { UnexpectedServerError } from '@lightdash/common';

/**
 * A Linear customer as read from the Linear API. `externalIds` is how a
 * customer is linked back to a Lightdash organization (set to the org uuid at
 * onboarding — see CS-27).
 */
export type LinearCustomer = {
    id: string;
    name: string;
    externalIds: string[];
};

/**
 * The public parts of a Linear issue associated with a customer. The workflow
 * state is mapped to a customer-facing status during curation; nothing else
 * here is exposed verbatim.
 */
export type LinearCustomerIssue = {
    id: string;
    title: string;
    description: string | null;
    state: {
        name: string;
        type: string;
    };
};

type GraphqlResponse<T> = {
    data?: T;
    errors?: Array<{ message: string }>;
};

type PageInfo = {
    hasNextPage: boolean;
    endCursor: string | null;
};

type CustomersQueryResponse = {
    customers: {
        nodes: LinearCustomer[];
        pageInfo: PageInfo;
    };
};

type CustomerNeedsQueryResponse = {
    customer: {
        needs: {
            nodes: Array<{
                issue: {
                    id: string;
                    title: string;
                    description: string | null;
                    labels: { nodes: Array<{ name: string }> };
                    state: { name: string; type: string };
                } | null;
            }>;
            pageInfo: PageInfo;
        };
    } | null;
};

const PAGE_SIZE = 100;

const CUSTOMERS_QUERY = `
    query Customers($after: String) {
        customers(first: ${PAGE_SIZE}, after: $after) {
            nodes { id name externalIds }
            pageInfo { hasNextPage endCursor }
        }
    }
`;

const CUSTOMER_NEEDS_QUERY = `
    query CustomerNeeds($customerId: String!, $after: String) {
        customer(id: $customerId) {
            needs(first: ${PAGE_SIZE}, after: $after) {
                nodes {
                    issue {
                        id
                        title
                        description
                        labels { nodes { name } }
                        state { name type }
                    }
                }
                pageInfo { hasNextPage endCursor }
            }
        }
    }
`;

type LinearClientArgs = {
    apiKey: string;
    apiUrl: string;
    featureRequestLabel: string | null;
};

/**
 * Thin wrapper over the Linear GraphQL API used by the roadmap service to
 * mirror customer feature requests. Read-only.
 */
export class LinearClient {
    private readonly apiKey: string;

    private readonly apiUrl: string;

    private readonly featureRequestLabel: string | null;

    constructor(args: LinearClientArgs) {
        this.apiKey = args.apiKey;
        this.apiUrl = args.apiUrl;
        this.featureRequestLabel = args.featureRequestLabel;
    }

    private async graphql<T>(
        query: string,
        variables: Record<string, unknown>,
    ): Promise<T> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: this.apiKey,
            },
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            throw new UnexpectedServerError(
                `Linear API request failed with status ${response.status}`,
            );
        }

        const { data, errors } = (await response.json()) as GraphqlResponse<T>;
        if (errors && errors.length > 0) {
            throw new UnexpectedServerError(
                `Linear API error: ${errors.map((e) => e.message).join(', ')}`,
            );
        }
        if (!data) {
            throw new UnexpectedServerError('Linear API returned no data');
        }
        return data;
    }

    async listCustomers(): Promise<LinearCustomer[]> {
        const customers: LinearCustomer[] = [];
        let after: string | null = null;
        // Cursor pagination is inherently sequential.
        /* eslint-disable no-await-in-loop */
        do {
            const { customers: page }: CustomersQueryResponse =
                await this.graphql<CustomersQueryResponse>(CUSTOMERS_QUERY, {
                    after,
                });
            customers.push(...page.nodes);
            after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
        } while (after !== null);
        /* eslint-enable no-await-in-loop */
        return customers;
    }

    async getCustomerFeatureRequests(
        customerId: string,
    ): Promise<LinearCustomerIssue[]> {
        const issues: LinearCustomerIssue[] = [];
        let after: string | null = null;
        // Cursor pagination is inherently sequential.
        /* eslint-disable no-await-in-loop */
        do {
            const { customer }: CustomerNeedsQueryResponse =
                await this.graphql<CustomerNeedsQueryResponse>(
                    CUSTOMER_NEEDS_QUERY,
                    { customerId, after },
                );
            if (!customer) {
                break;
            }
            customer.needs.nodes.forEach((need) => {
                const { issue } = need;
                if (!issue) {
                    return;
                }
                const labels = issue.labels.nodes.map((l) => l.name);
                if (
                    this.featureRequestLabel !== null &&
                    !labels.includes(this.featureRequestLabel)
                ) {
                    return;
                }
                issues.push({
                    id: issue.id,
                    title: issue.title,
                    description: issue.description,
                    state: issue.state,
                });
            });
            after = customer.needs.pageInfo.hasNextPage
                ? customer.needs.pageInfo.endCursor
                : null;
        } while (after !== null);
        /* eslint-enable no-await-in-loop */
        return issues;
    }
}
