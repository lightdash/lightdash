import { MetricType } from '@lightdash/common';
import '@mantine-8/core/styles.css';
import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router';
import { AiProposeChangeToolCall } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/AiProposeChangeToolCall';
import Mantine8Provider from '../providers/Mantine8Provider';
import ReactQueryProvider from '../providers/__mocks__/ReactQueryProvider';

const meta: Meta<typeof AiProposeChangeToolCall> = {
    decorators: [
        (renderStory) => (
            <MemoryRouter>
                <ReactQueryProvider>
                    <Mantine8Provider>{renderStory()}</Mantine8Provider>
                </ReactQueryProvider>
            </MemoryRouter>
        ),
    ],
    component: AiProposeChangeToolCall,
    tags: ['autodocs'],
    title: 'AI Copilot/AiProposeChangeToolCall',
};

export default meta;
type Story = StoryObj<typeof AiProposeChangeToolCall>;

export const UpdateTableDescription: Story = {
    args: {
        entityTableName: 'customers',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'table',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: 'Customer information including both B2B and B2C customers',
                    },
                    label: null,
                },
            },
        },
    },
};

export const UpdateTableLabel: Story = {
    args: {
        entityTableName: 'orders',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'table',
            value: {
                type: 'update',
                patch: {
                    description: null,
                    label: {
                        op: 'replace',
                        value: 'Customer Orders',
                    },
                },
            },
        },
    },
};

export const UpdateTableLabelAndDescription: Story = {
    args: {
        entityTableName: 'products',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'table',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: 'Product catalog containing all active and archived products',
                    },
                    label: {
                        op: 'replace',
                        value: 'Product Catalog',
                    },
                },
            },
        },
    },
};

export const UpdateDimensionDescription: Story = {
    args: {
        entityTableName: 'customers',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'dimension',
            fieldId: 'customer_name',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: 'Full name of the customer as registered in the system',
                    },
                    label: null,
                },
            },
        },
    },
};

export const UpdateDimensionLabel: Story = {
    args: {
        entityTableName: 'customers',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'dimension',
            fieldId: 'customer_email',
            value: {
                type: 'update',
                patch: {
                    description: null,
                    label: {
                        op: 'replace',
                        value: 'Email Address',
                    },
                },
            },
        },
    },
};

export const UpdateDimensionLabelAndDescription: Story = {
    args: {
        entityTableName: 'customers',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'dimension',
            fieldId: 'signup_date',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: 'Date when the customer first registered on the platform',
                    },
                    label: {
                        op: 'replace',
                        value: 'Registration Date',
                    },
                },
            },
        },
    },
};

export const UpdateMetricDescription: Story = {
    args: {
        entityTableName: 'orders',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'metric',
            fieldId: 'total_revenue',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: 'Net revenue after taxes and discounts, excluding refunds',
                    },
                    label: null,
                },
            },
        },
    },
};

export const UpdateMetricLabel: Story = {
    args: {
        entityTableName: 'orders',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'metric',
            fieldId: 'avg_order_value',
            value: {
                type: 'update',
                patch: {
                    description: null,
                    label: {
                        op: 'replace',
                        value: 'Average Order Value (AOV)',
                    },
                },
            },
        },
    },
};

export const UpdateMetricLabelAndDescription: Story = {
    args: {
        entityTableName: 'users',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'metric',
            fieldId: 'active_users',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: 'Count of active users in the last 30 days, excluding test accounts',
                    },
                    label: {
                        op: 'replace',
                        value: 'Monthly Active Users',
                    },
                },
            },
        },
    },
};

export const UpdateTableDescriptionWithMarkdown: Story = {
    args: {
        entityTableName: 'customers',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'table',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: `# Customer Data

This table contains customer information with the following characteristics:

- **B2B Customers**: Enterprise and business accounts
- **B2C Customers**: Individual consumer accounts
- **Status**: Both active and inactive customers

## Important Notes

> Data is synced daily from the CRM system at 2 AM UTC

For more information, see the [customer onboarding guide](https://example.com/docs/customers).`,
                    },
                    label: null,
                },
            },
        },
    },
};

export const UpdateDimensionDescriptionWithMarkdown: Story = {
    args: {
        entityTableName: 'orders',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'dimension',
            fieldId: 'order_status',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: `Current status of the order in the fulfillment pipeline:

1. **pending** - Order received, awaiting payment
2. **processing** - Payment confirmed, preparing shipment
3. **shipped** - Order dispatched to customer
4. **delivered** - Order received by customer
5. **cancelled** - Order cancelled by customer or system

\`\`\`sql
-- Example query
SELECT order_status, COUNT(*)
FROM orders
GROUP BY order_status
\`\`\``,
                    },
                    label: {
                        op: 'replace',
                        value: 'Order Status',
                    },
                },
            },
        },
    },
};

export const UpdateMetricDescriptionWithMarkdown: Story = {
    args: {
        entityTableName: 'revenue',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'metric',
            fieldId: 'mrr',
            value: {
                type: 'update',
                patch: {
                    description: {
                        op: 'replace',
                        value: `**Monthly Recurring Revenue (MRR)** calculation:

### Formula
\`MRR = Sum of all active subscription values normalized to monthly\`

### Inclusions
- Active subscription fees
- Recurring add-ons and upgrades

### Exclusions
- One-time setup fees
- Usage-based charges
- Refunds and credits

*Note: Values are in USD and updated nightly*`,
                    },
                    label: {
                        op: 'replace',
                        value: 'Monthly Recurring Revenue',
                    },
                },
            },
        },
    },
};

export const CreateMetricChurnRate: Story = {
    args: {
        entityTableName: 'customers',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'metric',
            fieldId: 'customers_churn_rate',
            value: {
                type: 'create',
                value: {
                    metric: {
                        name: 'churn_rate',
                        type: MetricType.AVERAGE,
                        label: 'Churn Rate (No Orders in Last 1 Month)',
                        description:
                            'Churn rate is the percentage of customers who stop ordering in the last 30 days.',
                        table: 'customers',
                        baseDimensionName: 'customer_id',
                    },
                    entityType: 'metric',
                },
            },
        },
    },
};

export const CreateMetricTotalRevenue: Story = {
    args: {
        entityTableName: 'orders',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'metric',
            fieldId: 'orders_total_revenue',
            value: {
                type: 'create',
                value: {
                    metric: {
                        name: 'total_revenue',
                        type: MetricType.SUM,
                        label: 'Total Revenue',
                        description:
                            'Total revenue from all orders, including taxes and discounts.',
                        table: 'orders',
                        baseDimensionName: 'order_total',
                    },
                    entityType: 'metric',
                },
            },
        },
    },
};

export const CreateMetricCustomerCount: Story = {
    args: {
        entityTableName: 'customers',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'metric',
            fieldId: 'customers_count',
            value: {
                type: 'create',
                value: {
                    metric: {
                        name: 'customer_count',
                        type: MetricType.COUNT,
                        label: 'Total Customers',
                        description:
                            'Total number of customers in the database.',
                        table: 'customers',
                        baseDimensionName: 'customer_id',
                    },
                    entityType: 'metric',
                },
            },
        },
    },
};

export const CreateMetricAverageOrderValue: Story = {
    args: {
        entityTableName: 'orders',
        projectUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
        change: {
            entityType: 'metric',
            fieldId: 'orders_avg_value',
            value: {
                type: 'create',
                value: {
                    metric: {
                        name: 'average_order_value',
                        type: MetricType.AVERAGE,
                        label: 'Average Order Value',
                        description:
                            'Average order value from all orders, including taxes and discounts.',
                        table: 'orders',
                        baseDimensionName: 'order_total',
                    },
                    entityType: 'metric',
                },
            },
        },
    },
};
