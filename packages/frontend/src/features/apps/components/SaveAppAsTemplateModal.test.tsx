import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { useSaveAppAsTemplate } from '../hooks/useSaveAppAsTemplate';
import { SaveAppAsTemplateModal } from './SaveAppAsTemplateModal';

vi.mock('../hooks/useSaveAppAsTemplate', () => ({
    useSaveAppAsTemplate: vi.fn(),
    useCanSaveAppAsTemplate: () => true,
}));

const setup = () => {
    const mutate = vi.fn();
    vi.mocked(useSaveAppAsTemplate).mockReturnValue({
        mutate,
        isLoading: false,
    } as never);
    render(
        <MantineProvider env="test">
            <SaveAppAsTemplateModal
                opened
                onClose={vi.fn()}
                projectUuid="project-1"
                appUuid="app-1"
                appName="Revenue Forecaster"
                appDescription="Monthly revenue with a live forecast."
            />
        </MantineProvider>,
    );
    return { mutate };
};

describe('SaveAppAsTemplateModal', () => {
    it('pre-fills the identity from the app and publishes with the questions entered', () => {
        const { mutate } = setup();
        expect(screen.getByLabelText(/^Name/)).toHaveValue(
            'Revenue Forecaster',
        );
        expect(screen.getByLabelText(/Template id/)).toHaveValue(
            'revenue-forecaster',
        );
        fireEvent.click(screen.getByRole('button', { name: /Add question/i }));
        fireEvent.change(screen.getByLabelText('Question'), {
            target: { value: 'What should we forecast?' },
        });
        fireEvent.change(screen.getByLabelText('Default answer'), {
            target: { value: 'Total order revenue' },
        });
        fireEvent.change(screen.getByLabelText(/Guidance for the agent/), {
            target: { value: 'Keep the monthly methodology.' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: /Publish template/i }),
        );
        expect(mutate).toHaveBeenCalledTimes(1);
        expect(mutate.mock.calls[0][0]).toEqual({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            template: {
                id: 'revenue-forecaster',
                name: 'Revenue Forecaster',
                description: 'Monthly revenue with a live forecast.',
                category: 'General',
            },
            questions: [
                {
                    key: 'what_should_we_forecast',
                    label: 'What should we forecast?',
                    default: 'Total order revenue',
                },
            ],
            guardrails: 'Keep the monthly methodology.',
        });
    });

    it('blocks publishing on an invalid template id', () => {
        const { mutate } = setup();
        fireEvent.change(screen.getByLabelText(/Template id/), {
            target: { value: 'Not A Slug' },
        });
        expect(
            screen.getByText(/Lowercase letters, numbers and dashes/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Publish template/i }),
        ).toBeDisabled();
        expect(mutate).not.toHaveBeenCalled();
    });
});
