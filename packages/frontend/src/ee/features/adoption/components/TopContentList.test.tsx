import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { TopContentList } from './TopContentList';

const VIEWS = { one: 'view', other: 'views' };
const QUERIES = { one: 'query', other: 'queries' };
const LONG_NAME =
    'Scheduled delivery edge cases for the regional warehouse dashboard';

describe('TopContentList', () => {
    it('keeps each count on one line and shortens the name instead', () => {
        renderWithProviders(
            <TopContentList
                title="Dashboards"
                noun={VIEWS}
                items={[
                    {
                        id: 'd1',
                        name: LONG_NAME,
                        count: 37405,
                        distinctPeople: 92,
                    },
                ]}
            />,
        );
        const count = screen.getByText('37,405 views · 92 people');
        // The count never wraps or gives up width; the name takes what is left
        expect(count).toHaveStyle({ whiteSpace: 'nowrap', flexShrink: '0' });
        expect(count.parentElement).toHaveStyle('--group-wrap: nowrap');
        const name = screen.getByText(LONG_NAME);
        expect(name).toHaveAttribute('data-truncate', 'end');
        expect(name).toHaveStyle({ minWidth: '0' });
        expect(name.parentElement).toBe(count.parentElement);
    });
    it('uses the singular for one', () => {
        renderWithProviders(
            <TopContentList
                title="Explores"
                noun={QUERIES}
                items={[
                    { id: 'e1', name: 'orders', count: 1, distinctPeople: 1 },
                    { id: 'e2', name: 'events', count: 5, distinctPeople: 2 },
                ]}
            />,
        );
        expect(screen.getByText('1 query · 1 person')).toBeVisible();
        expect(screen.getByText('5 queries · 2 people')).toBeVisible();
    });
    it('says so when nothing was used', () => {
        renderWithProviders(
            <TopContentList
                title="AI agents"
                noun={{ one: 'prompt', other: 'prompts' }}
                items={[]}
            />,
        );
        expect(screen.getByText('Nothing in the last 30 days')).toBeVisible();
    });
});
