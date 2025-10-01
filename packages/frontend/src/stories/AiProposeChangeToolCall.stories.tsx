import '@mantine-8/core/styles.css';
import type { Meta, StoryObj } from '@storybook/react';
import { AiProposeChangeToolCall } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/AiProposeChangeToolCall';
import Mantine8Provider from '../providers/Mantine8Provider';

const meta: Meta<typeof AiProposeChangeToolCall> = {
    decorators: [
        (renderStory) => <Mantine8Provider>{renderStory()}</Mantine8Provider>,
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
