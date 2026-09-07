import { type Meta, type StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { AiSqlModal } from './AiSqlModal';

const meta = {
    component: AiSqlModal,
    title: 'AI Agent/SQL modal',
    args: {
        opened: true,
        onClose: fn(),
    },
} satisfies Meta<typeof AiSqlModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Formatted: Story = {
    args: {
        sql: 'SELECT customers.customer_id, customers.first_name, orders.order_date, payments.payment_method, payments.amount AS total_payment_amount FROM jaffle_shop.customers AS customers LEFT JOIN jaffle_shop.orders AS orders ON customers.customer_id = orders.customer_id LEFT JOIN jaffle_shop.payments AS payments ON orders.order_id = payments.order_id ORDER BY total_payment_amount DESC;',
    },
};

export const LongLine: Story = {
    args: {
        sql: `SELECT '${'A long SQL value that must remain intact. '.repeat(10)}' AS explanation, customers.customer_id FROM jaffle_shop.customers AS customers;`,
    },
};

export const TallQuery: Story = {
    args: {
        sql: Array.from({ length: 30 }, () => Formatted.args.sql).join('\n'),
    },
};

export const ShortQuery: Story = {
    args: { sql: 'SELECT 1;' },
};

export const FormattingFallback: Story = {
    args: { sql: 'SELECT {{ unresolved_template }} FROM customers;' },
};
