// AppTemplatePicker.test.tsx
import { type DataAppTemplateSummary } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import AppTemplatePicker from './AppTemplatePicker';
import { useTemplateGallery } from './hooks/useTemplateGallery';

vi.mock('./hooks/useTemplateGallery', () => ({
    useTemplateGallery: vi.fn(),
}));

const FORECASTER: DataAppTemplateSummary = {
    templateUuid: 'tpl-1',
    organizationUuid: 'org-1',
    slug: 'metric-forecaster',
    name: 'Metric Forecaster',
    description: 'A live what-if forecast.',
    category: 'Forecasting',
    questions: [{ key: 'metric', label: 'What should we forecast?' }],
    kind: 'seeded',
    fileCount: 3,
    createdByUserUuid: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockGallery = (templates: DataAppTemplateSummary[]) =>
    vi.mocked(useTemplateGallery).mockReturnValue({
        isLoading: false,
        enabled: templates.length > 0,
        templates,
    });

// The picker reads the templates flag through react-query; the fan under
// test is the ungated one, so resolve the flag as off without a client.
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        isLoading: false,
        data: { enabled: false },
    }),
}));

const setup = (
    selected:
        | 'dashboard'
        | 'slideshow'
        | 'pdf'
        | 'custom'
        | 'data_app_viz'
        | null,
    {
        onSelectedChange = vi.fn(),
        selectedOrgTemplate = null as DataAppTemplateSummary | null,
        onSelectedOrgTemplateChange = vi.fn(),
    } = {},
) => {
    render(
        <MantineProvider env="test">
            <AppTemplatePicker
                selected={selected}
                onSelectedChange={onSelectedChange}
                selectedOrgTemplate={selectedOrgTemplate}
                onSelectedOrgTemplateChange={onSelectedOrgTemplateChange}
            />
        </MantineProvider>,
    );
    return { onSelectedChange, onSelectedOrgTemplateChange };
};

describe('AppTemplatePicker', () => {
    beforeEach(() => {
        mockGallery([]);
    });

    it('renders the app starting points, no viz template, no Lets go button', () => {
        setup(null);
        expect(
            screen.getByRole('button', { name: /Dashboard/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Slide Show/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /PDF Report/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /From scratch/i }),
        ).toBeInTheDocument();
        // Vizs (custom chart types) are created from Explorer, not here.
        expect(
            screen.queryByRole('button', { name: /Data app visualization/i }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Let's go/i }),
        ).not.toBeInTheDocument();
    });

    it('offers no From Template card when the org has no templates', () => {
        setup(null);
        expect(
            screen.queryByRole('button', { name: /From Template/i }),
        ).not.toBeInTheDocument();
    });

    it('nothing is selected by default', () => {
        setup(null);
        expect(
            screen.queryByRole('button', { pressed: true }),
        ).not.toBeInTheDocument();
    });

    it('selecting a card reports the template', () => {
        const { onSelectedChange } = setup(null);
        fireEvent.click(screen.getByRole('button', { name: /Slide Show/i }));
        expect(onSelectedChange).toHaveBeenCalledWith('slideshow');
    });

    it('selecting From scratch reports the custom template', () => {
        const { onSelectedChange } = setup(null);
        fireEvent.click(screen.getByRole('button', { name: /From scratch/i }));
        expect(onSelectedChange).toHaveBeenCalledWith('custom');
    });

    it('clicking the selected card deselects it', () => {
        const { onSelectedChange } = setup('dashboard');
        fireEvent.click(screen.getByRole('button', { name: /Dashboard/i }));
        expect(onSelectedChange).toHaveBeenCalledWith(null);
    });

    it('opens the gallery of org templates behind From Template and reports the pick', () => {
        mockGallery([FORECASTER]);
        const { onSelectedOrgTemplateChange, onSelectedChange } = setup(null);
        fireEvent.click(screen.getByRole('button', { name: /From Template/i }));
        fireEvent.click(
            screen.getByRole('button', { name: /Metric Forecaster/i }),
        );
        expect(onSelectedOrgTemplateChange).toHaveBeenCalledWith(FORECASTER);
        // A gallery pick clears any flavour selection.
        expect(onSelectedChange).toHaveBeenCalledWith(null);
    });

    it('shows the chosen org template on the From Template card', () => {
        mockGallery([FORECASTER]);
        setup(null, { selectedOrgTemplate: FORECASTER });
        expect(
            screen.getByRole('button', { name: /Metric Forecaster/i }),
        ).toHaveAttribute('aria-pressed', 'true');
    });
});
