import { SearchItemType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import OmnibarFilters from './OmnibarFilters';

const flag = vi.hoisted(() => ({
    data: { enabled: true } as { enabled: boolean } | undefined,
    isError: false,
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => flag,
}));
vi.mock('../../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({ data: [] }),
}));

const openFilter = () => {
    const onSearchFilterChange = vi.fn();
    render(
        <MantineProvider env="test">
            <OmnibarFilters onSearchFilterChange={onSearchFilterChange} />
        </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Item type' }));
    return onSearchFilterChange;
};

describe('Documents in the global search type filter', () => {
    beforeEach(() => {
        flag.data = { enabled: true };
        flag.isError = false;
    });

    it('selects Documents alongside existing content types', () => {
        const onChange = openFilter();
        expect(screen.getByRole('menuitem', { name: 'Charts' })).toBeVisible();
        expect(
            screen.getByRole('menuitem', { name: 'Dashboards' }),
        ).toBeVisible();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Documents' }));
        expect(onChange).toHaveBeenCalledWith({
            type: SearchItemType.DOCUMENT,
            verifiedOnly: undefined,
        });
    });

    it.each([
        { data: { enabled: false }, isError: false },
        { data: undefined, isError: false },
        { data: { enabled: true }, isError: true },
    ])('hides Documents when unavailable: %j', ({ data, isError }) => {
        flag.data = data;
        flag.isError = isError;
        openFilter();
        expect(
            screen.queryByRole('menuitem', { name: 'Documents' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Charts' })).toBeVisible();
    });
});
