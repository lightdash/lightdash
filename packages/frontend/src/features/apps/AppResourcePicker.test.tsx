import { type Project } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import { ProjectRouteContext } from '../../hooks/useProjectRoute';
import { AttachButton, SelectedQuerySection } from './AppResourcePicker';
import { useAttachResourceLink } from './hooks/useAttachResourceLink';

vi.mock('./hooks/useAttachResourceLink', () => ({
    useAttachResourceLink: vi.fn(() => ({
        attachFromLink: vi.fn(),
        isResolvingLink: false,
    })),
}));

const baseChart = {
    uuid: 'c1',
    name: 'Rev',
    includeSampleData: false,
    linkLive: false,
};

it('calls onToggleLink when the Link live button is clicked', () => {
    const onToggleLink = vi.fn();
    render(
        <MantineProvider env="test">
            <SelectedQuerySection
                charts={[baseChart]}
                onRemove={() => {}}
                onToggleSampleData={() => {}}
                onToggleLink={onToggleLink}
                sampleDataEnabled
            />
        </MantineProvider>,
    );
    fireEvent.click(screen.getByLabelText('Link live'));
    expect(onToggleLink).toHaveBeenCalledWith('c1');
});

it('hides the sample-data control when the chart is linked', () => {
    render(
        <MantineProvider env="test">
            <SelectedQuerySection
                charts={[{ ...baseChart, linkLive: true }]}
                onRemove={() => {}}
                onToggleSampleData={() => {}}
                onToggleLink={() => {}}
                sampleDataEnabled
            />
        </MantineProvider>,
    );
    expect(screen.queryByLabelText('Include sample data')).toBeNull();
    expect(screen.getByLabelText('Linked: on')).toBeInTheDocument();
});

it('hides the sample-data controls when the instance disables sample data', () => {
    render(
        <MantineProvider env="test">
            <SelectedQuerySection
                charts={[baseChart]}
                onRemove={() => {}}
                onToggleSampleData={() => {}}
                onToggleLink={() => {}}
                sampleDataEnabled={false}
            />
        </MantineProvider>,
    );
    expect(screen.queryByLabelText('Include sample data')).toBeNull();
    expect(screen.getByLabelText('Link live')).toBeInTheDocument();
});

it('resolves a project slug URL to the canonical uuid before wiring the attach-link resolver', () => {
    render(
        <MantineProvider env="test">
            <MemoryRouter initialEntries={['/projects/jaffle-shop/generate']}>
                <Routes>
                    <Route
                        path="/projects/:projectUuid/generate"
                        element={
                            <ProjectRouteContext.Provider
                                value={{
                                    project: {} as Project,
                                    projectUuid: 'resolved-project-uuid',
                                    projectUrlIdentifier: 'jaffle-shop',
                                }}
                            >
                                <AttachButton
                                    selectedCharts={[]}
                                    onSelectChart={() => {}}
                                    onDeselectChart={() => {}}
                                    selectedDashboard={null}
                                    onSelectDashboard={() => {}}
                                    onDeselectDashboard={() => {}}
                                    selectedConnections={[]}
                                    onSelectConnection={() => {}}
                                    onDeselectConnection={() => {}}
                                    onAddFiles={() => {}}
                                    disabled={false}
                                    filesDisabled={false}
                                />
                            </ProjectRouteContext.Provider>
                        }
                    />
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

    expect(useAttachResourceLink).toHaveBeenCalledWith(
        expect.objectContaining({ projectUuid: 'resolved-project-uuid' }),
    );
});
