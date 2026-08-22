import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import ViewsCountPopover from './ViewsCountPopover';

describe('ViewsCountPopover', () => {
    it('shows unique viewer statistics on hover', async () => {
        renderWithProviders(
            <ViewsCountPopover
                resourceType="chart"
                resourceUuid="chart-uuid"
                projectUuid="project-uuid"
                viewStats={{
                    views: 12,
                    uniqueViewerCount: 4,
                    anonymousViewCount: 2,
                    firstViewedAt: null,
                }}
            >
                12 views
            </ViewsCountPopover>,
        );

        await userEvent.hover(screen.getByText('12 views'));

        expect(await screen.findByText('4 unique viewers')).toBeVisible();
        expect(screen.getByText('Plus 2 anonymous views')).toBeVisible();
    });
});
