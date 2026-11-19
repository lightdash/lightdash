import { type Meta, type StoryObj } from '@storybook/react-vite';
import { LiveResultNotices } from '../features/externalConnections/liveSources/LiveResultNotices';

const meta = {
    component: LiveResultNotices,
    title: 'Live data sources/Result notices',
} satisfies Meta<typeof LiveResultNotices>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Truncated: Story = {
    args: {
        notices: [
            {
                type: 'truncated',
                rowCount: 500,
                message:
                    'Showing the first 500 rows. Search Console has more: raise the row limit or add filters to see the rest.',
            },
        ],
    },
};

export const DefaultDateWindowAndCounting: Story = {
    args: {
        notices: [
            {
                type: 'defaultDateWindow',
                fieldId: 'search_console_performance_date',
                days: 28,
                message:
                    'No Date filter, so this shows the last 28 full days. Filter on Date to choose the dates.',
            },
            {
                type: 'providerCounting',
                fieldIds: ['search_console_performance_page'],
                message:
                    'Google counts per page when a query splits or filters by Page: a search showing two of your pages counts twice, so impressions and clicks run higher than the site total.',
            },
        ],
    },
};

export const None: Story = {
    args: { notices: [] },
};
