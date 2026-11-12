import { type AskUserQuestion } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AskUserQuestionCard } from './AskUserQuestionCard';

const period: AskUserQuestion = {
    header: 'Period',
    question: 'Which month?',
    options: [
        { label: 'November 2022', description: 'Latest full month' },
        { label: 'October 2022', description: 'Previous month' },
    ],
    multiSelect: false,
};

const metrics: AskUserQuestion = {
    header: 'Metrics',
    question: 'Which metrics?',
    options: [
        { label: 'Revenue', description: '' },
        { label: 'Orders', description: '' },
    ],
    multiSelect: true,
};

const renderCard = (questions: AskUserQuestion[]) => {
    const onSubmit = vi.fn();
    render(
        <MantineProvider env="test">
            <AskUserQuestionCard questions={questions} onSubmit={onSubmit} />
        </MantineProvider>,
    );
    return onSubmit;
};

describe('AskUserQuestionCard', () => {
    it('sends the picked option as the answer', () => {
        const onSubmit = renderCard([period]);
        const submit = screen.getByRole('button', { name: 'Submit answer' });
        expect(submit).toBeDisabled();

        fireEvent.click(screen.getByLabelText('October 2022'));
        fireEvent.click(submit);

        expect(onSubmit).toHaveBeenCalledWith('October 2022');
    });

    it('picks options with number keys outside text inputs', () => {
        const onSubmit = renderCard([period]);

        fireEvent.keyDown(document, { key: '1' });
        fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

        expect(onSubmit).toHaveBeenCalledWith('November 2022');
    });

    it('steps through several questions and labels each answer', () => {
        const onSubmit = renderCard([period, metrics]);

        fireEvent.click(screen.getByLabelText('November 2022'));
        expect(screen.getByText('Which metrics?')).toBeVisible();
        fireEvent.click(screen.getByLabelText('Revenue'));
        fireEvent.click(screen.getByLabelText('Orders'));
        fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }));

        expect(onSubmit).toHaveBeenCalledWith(
            'Period: November 2022\nMetrics: Revenue, Orders',
        );
    });

    it('sends a typed answer in place of the options', () => {
        const onSubmit = renderCard([period, metrics]);

        fireEvent.change(screen.getByLabelText('Your own answer'), {
            target: { value: 'Q4 2022' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByLabelText('Revenue'));
        fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }));

        expect(onSubmit).toHaveBeenCalledWith(
            'Period: Q4 2022\nMetrics: Revenue',
        );
    });
});
