import { ContentReviewContentType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lightdashApi } from '../../../../api';
import { renderWithProviders } from '../../../../testing/testUtils';
import SaveChartSuggestions from './SaveChartSuggestions';

const availability = vi.hoisted(() => ({ isAvailable: true }));
vi.mock('../hooks/useContentReviewAvailability', () => ({
    useContentReviewAvailability: () => availability,
}));
vi.mock('../../../../api', () => ({ lightdashApi: vi.fn() }));

const match = {
    contentType: ContentReviewContentType.CHART,
    contentUuid: 'existing',
    name: 'Revenue',
    slug: 'revenue',
    spaceUuid: 'finance',
    spaceName: 'Finance',
    isVerified: true,
    score: 102,
    matchReason: 'same_name' as const,
};

beforeEach(() => {
    availability.isAvailable = true;
    vi.mocked(lightdashApi).mockReset().mockResolvedValue([match]);
});

it('shows explained suggestions with a safe link to the existing chart', async () => {
    renderWithProviders(
        <SaveChartSuggestions projectUuid="project" name="Revenue" />,
    );
    const disclosure = await screen.findByRole('button', {
        name: '1 similar chart found',
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const link = await screen.findByRole('link', { name: /Revenue/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', '/projects/project/saved/revenue');
    expect(screen.getByText('Same name · in Finance')).toBeInTheDocument();
    await userEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    disclosure.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('link', { name: /Revenue/ })).toBeInTheDocument();
    expect(lightdashApi).toHaveBeenCalledWith(
        expect.objectContaining({
            url: '/projects/project/review-requests/similar?contentType=chart&name=Revenue',
        }),
    );
});

it.each([
    { projectUuid: 'project', name: 'Revenue', enabled: false },
    { projectUuid: null, name: 'Revenue', enabled: true },
    { projectUuid: 'project', name: '  ', enabled: true },
    { projectUuid: 'project', name: 'ab', enabled: true },
])(
    'does not fetch when suggestions are unavailable: %j',
    ({ projectUuid, name, enabled }) => {
        availability.isAvailable = enabled;
        renderWithProviders(
            <SaveChartSuggestions projectUuid={projectUuid} name={name} />,
        );
        expect(
            screen.queryByText('1 similar chart found'),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalled();
    },
);

it('debounces name edits and hides results for the previous name', async () => {
    const { rerender } = renderWithProviders(
        <SaveChartSuggestions projectUuid="project" name="Revenue" />,
    );
    await screen.findByText('1 similar chart found');
    rerender(<SaveChartSuggestions projectUuid="project" name="Customer" />);
    rerender(
        <SaveChartSuggestions projectUuid="project" name="Customer churn" />,
    );
    expect(screen.queryByText('1 similar chart found')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
    await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(2));
    expect(lightdashApi).toHaveBeenLastCalledWith(
        expect.objectContaining({
            url: expect.stringContaining('name=Customer+churn'),
        }),
    );
});

it('distinguishes failed checks and lets the user retry', async () => {
    vi.mocked(lightdashApi).mockRejectedValue(new Error('Unavailable'));
    renderWithProviders(
        <SaveChartSuggestions projectUuid="project" name="Revenue" />,
    );
    expect(
        await screen.findByText('Related charts could not be checked.'),
    ).toBeInTheDocument();
    vi.mocked(lightdashApi).mockResolvedValue([match]);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
        await screen.findByText('1 similar chart found'),
    ).toBeInTheDocument();
});

it('does not show a warning when there are no matches', async () => {
    vi.mocked(lightdashApi).mockResolvedValue([]);
    renderWithProviders(
        <SaveChartSuggestions projectUuid="project" name="Revenue" />,
    );
    await waitFor(() => expect(lightdashApi).toHaveBeenCalledOnce());
    await waitFor(() =>
        expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('1 similar chart found')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('expands suggestions and labels older snapshots conservatively', async () => {
    vi.mocked(lightdashApi).mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
            ...match,
            contentUuid: `chart-${i}`,
            name: `Revenue ${i}`,
            matchReason: undefined,
        })),
    );
    renderWithProviders(
        <SaveChartSuggestions projectUuid="project" name="Revenue" />,
    );
    await userEvent.click(
        await screen.findByRole('button', { name: '5 similar charts found' }),
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getAllByText('Similar name · in Finance')).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByRole('link')).toHaveLength(3);
});
