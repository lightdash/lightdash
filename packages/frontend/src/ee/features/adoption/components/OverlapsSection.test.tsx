import { type DepartmentOverlaps } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { OverlapsSection } from './OverlapsSection';

const DATA = { departmentUuid: 'data', name: 'Data' };
const MARKETING = { departmentUuid: 'marketing', name: 'Marketing' };

const overlapsOf = (
    over: Partial<DepartmentOverlaps> = {},
): DepartmentOverlaps => ({
    department: DATA,
    overlaps: [{ ...MARKETING, people: 3, active30d: 1 }],
    venn: {
        sets: [DATA, MARKETING],
        regions: [
            { sets: ['data'], people: 9, active30d: 2 },
            { sets: ['marketing'], people: 40, active30d: 4 },
            { sets: ['data', 'marketing'], people: 3, active30d: 1 },
        ],
    },
    members: null,
    ...over,
});

const renderSection = (
    props: Partial<Parameters<typeof OverlapsSection>[0]> = {},
) => {
    const onSelect = vi.fn();
    const onRetry = vi.fn();
    renderWithProviders(
        <OverlapsSection
            overlaps={overlapsOf()}
            isError={false}
            onRetry={onRetry}
            selection={null}
            onSelect={onSelect}
            headingRef={createRef<HTMLHeadingElement>()}
            {...props}
        />,
    );
    return { onSelect, onRetry };
};

describe('OverlapsSection', () => {
    it('shows the diagram and every overlapping department', () => {
        renderSection();
        expect(screen.getByRole('heading', { name: 'Overlaps' })).toBeVisible();
        expect(
            screen.getByRole('group', {
                name: 'Overlap of Data and Marketing',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Marketing, 3 people, 1 active',
            }),
        ).toBeVisible();
        expect(
            screen.getByRole('button', {
                name: 'Data and Marketing, 3 people',
            }),
        ).toBeInTheDocument();
    });
    it('hands its heading to the page to take focus, without making it a tab stop', () => {
        const headingRef = createRef<HTMLHeadingElement>();
        renderSection({ headingRef });
        const heading = screen.getByRole('heading', { name: 'Overlaps' });
        expect(headingRef.current).toBe(heading);
        expect(heading).toHaveAttribute('tabindex', '-1');
    });
    it('is hidden when no department outside this one shares its people', () => {
        renderSection({ overlaps: overlapsOf({ overlaps: [], venn: null }) });
        expect(
            screen.queryByRole('heading', { name: 'Overlaps' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
    it('is hidden until the overlaps arrive', () => {
        renderSection({ overlaps: null });
        expect(
            screen.queryByRole('heading', { name: 'Overlaps' }),
        ).not.toBeInTheDocument();
    });
    it('lists the departments without a diagram when there is none', () => {
        renderSection({ overlaps: overlapsOf({ venn: null }) });
        expect(screen.queryByRole('group')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Marketing, 3 people, 1 active',
            }),
        ).toBeVisible();
    });
    it('passes on a department chosen in the list or the diagram', async () => {
        const { onSelect } = renderSection();
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Marketing, 3 people, 1 active',
            }),
        );
        expect(onSelect).toHaveBeenLastCalledWith({
            withDepartments: [MARKETING],
            withoutDepartments: [],
        });
        await userEvent.click(
            screen.getByRole('button', { name: 'Data only, 9 people' }),
        );
        expect(onSelect).toHaveBeenLastCalledWith({
            withDepartments: [],
            withoutDepartments: [MARKETING],
        });
    });
    it('says so when the overlaps cannot be loaded, with a retry', async () => {
        const { onRetry } = renderSection({ overlaps: null, isError: true });
        expect(screen.getByRole('heading', { name: 'Overlaps' })).toBeVisible();
        expect(screen.getByText("Overlaps couldn't be loaded")).toBeVisible();
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledOnce();
    });
});
