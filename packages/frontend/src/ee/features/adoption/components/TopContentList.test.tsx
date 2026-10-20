import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { TopContentList } from './TopContentList';
import styles from './TopContentList.module.css';

const VIEWS = { one: 'view', other: 'views' };
const QUERIES = { one: 'query', other: 'queries' };
const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';
const LONG_NAME =
    'Scheduled delivery edge cases for the regional warehouse dashboard';

const renderList = (list: Parameters<typeof TopContentList>[0]) =>
    renderWithProviders(
        <MemoryRouter>
            <TopContentList {...list} />
        </MemoryRouter>,
    );

describe('TopContentList', () => {
    it('keeps each count on one line and shortens the linked name instead', () => {
        renderList({
            title: 'Dashboards',
            kind: 'dashboards',
            noun: VIEWS,
            items: [
                {
                    id: 'd1',
                    name: LONG_NAME,
                    projectUuid: PROJECT,
                    count: 37405,
                    distinctPeople: 92,
                },
            ],
        });
        const count = screen.getByText('37,405 views · 92 people');
        // The count never wraps or gives up width; the name takes what is left
        expect(count).toHaveClass(styles.usage);
        expect(count).toHaveStyle({ flexShrink: '0' });
        expect(count.parentElement).toHaveStyle('--group-wrap: nowrap');
        const name = screen.getByRole('link', { name: LONG_NAME });
        expect(name).toHaveAttribute('data-truncate', 'end');
        expect(name).toHaveAttribute('title', LONG_NAME);
        expect(name).toHaveStyle({ minWidth: '0rem', flexGrow: '1' });
        expect(name.parentElement).toBe(count.parentElement);
    });
    it('links each item to its content', () => {
        const item = (id: string, name: string) => ({
            id,
            name,
            projectUuid: PROJECT,
            count: 1,
            distinctPeople: 1,
        });
        renderList({
            title: 'Dashboards',
            kind: 'dashboards',
            noun: VIEWS,
            items: [item('d1', 'Sales')],
        });
        renderList({
            title: 'Explores',
            kind: 'explores',
            noun: QUERIES,
            items: [item(`${PROJECT}:orders`, 'orders')],
        });
        renderList({
            title: 'AI agents',
            kind: 'aiAgents',
            noun: { one: 'prompt', other: 'prompts' },
            items: [item('a1', 'Analyst')],
        });
        expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute(
            'href',
            `/projects/${PROJECT}/dashboards/d1/view`,
        );
        expect(screen.getByRole('link', { name: 'orders' })).toHaveAttribute(
            'href',
            `/projects/${PROJECT}/tables/orders`,
        );
        expect(screen.getByRole('link', { name: 'Analyst' })).toHaveAttribute(
            'href',
            `/projects/${PROJECT}/ai-agents/a1`,
        );
    });
    it('uses the singular for one', () => {
        renderList({
            title: 'Explores',
            kind: 'explores',
            noun: QUERIES,
            items: [
                {
                    id: 'e1',
                    name: 'orders',
                    projectUuid: PROJECT,
                    count: 1,
                    distinctPeople: 1,
                },
                {
                    id: 'e2',
                    name: 'events',
                    projectUuid: PROJECT,
                    count: 5,
                    distinctPeople: 2,
                },
            ],
        });
        expect(screen.getByText('1 query · 1 person')).toBeVisible();
        expect(screen.getByText('5 queries · 2 people')).toBeVisible();
    });
    it('says so when nothing was used', () => {
        renderList({
            title: 'AI agents',
            kind: 'aiAgents',
            noun: { one: 'prompt', other: 'prompts' },
            items: [],
        });
        expect(screen.getByText('Nothing in the last 30 days')).toBeVisible();
    });
});
