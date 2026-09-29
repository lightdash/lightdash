import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useOrganizationChartTypesSetting,
    useUpdateOrganizationChartTypesSetting,
} from '../../../hooks/organization/useOrganizationChartTypesSetting';
import { renderWithProviders } from '../../../testing/testUtils';
import { OrganizationChartTypesSettingsPage } from './OrganizationChartTypesSettingsPage';

vi.mock('../../../hooks/organization/useOrganizationChartTypesSetting', () => ({
    useOrganizationChartTypesSetting: vi.fn(),
    useUpdateOrganizationChartTypesSetting: vi.fn(),
}));

const mutate = vi.fn();

const setup = (enabled: boolean) => {
    vi.mocked(useOrganizationChartTypesSetting).mockReturnValue({
        data: { enabled },
        isError: false,
        refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrganizationChartTypesSetting>);
    renderWithProviders(<OrganizationChartTypesSettingsPage />);
};

describe('OrganizationChartTypesSettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useUpdateOrganizationChartTypesSetting).mockReturnValue({
            mutate,
            isLoading: false,
        } as unknown as ReturnType<
            typeof useUpdateOrganizationChartTypesSetting
        >);
    });

    it('explains the organization library', () => {
        setup(false);

        expect(screen.getByText('Organization library')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Chart types in the organization library can be used in every project.',
            ),
        ).toBeInTheDocument();
    });

    it.each([
        { enabled: false, next: true },
        { enabled: true, next: false },
    ])('toggles the setting from $enabled', async ({ enabled, next }) => {
        setup(enabled);
        const toggle = screen.getByRole('switch', {
            name: 'Organization library',
        });

        if (enabled) {
            expect(toggle).toBeChecked();
        } else {
            expect(toggle).not.toBeChecked();
        }
        await userEvent.click(toggle);

        expect(mutate).toHaveBeenCalledWith({ enabled: next });
    });
});
