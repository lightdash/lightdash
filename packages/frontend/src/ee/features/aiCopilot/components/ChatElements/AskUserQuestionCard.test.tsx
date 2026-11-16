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

        fireEvent.click(screen.getByRole('radio', { name: /October 2022/ }));
        fireEvent.click(submit);

        expect(onSubmit).toHaveBeenCalledWith({
            text: 'October 2022',
            typedAnswerCount: 0,
        });
    });

    it('picks with a number key and submits with Enter', () => {
        const onSubmit = renderCard([period]);
        const card = document.activeElement as HTMLElement;

        fireEvent.keyDown(card, { key: '2' });
        expect(
            screen.getByRole('radio', { name: /October 2022/ }),
        ).toBeChecked();
        fireEvent.keyDown(card, { key: 'Enter' });

        expect(onSubmit).toHaveBeenCalledWith({
            text: 'October 2022',
            typedAnswerCount: 0,
        });
    });

    it('ignores number keys typed into the answer box', () => {
        renderCard([period]);

        fireEvent.keyDown(screen.getByLabelText('Your own answer'), {
            key: '1',
        });

        expect(
            screen.getByRole('radio', { name: /November 2022/ }),
        ).not.toBeChecked();
    });

    it('steps through several questions and labels each answer', () => {
        const onSubmit = renderCard([period, metrics]);

        fireEvent.click(screen.getByRole('radio', { name: /November 2022/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByText('Which metrics?')).toBeVisible();
        fireEvent.click(screen.getByRole('checkbox', { name: /Revenue/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /Orders/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }));

        expect(onSubmit).toHaveBeenCalledWith({
            text: 'Period: November 2022\nMetrics: Revenue, Orders',
            typedAnswerCount: 0,
        });
    });

    it('sends a typed answer in place of the options', () => {
        const onSubmit = renderCard([period, metrics]);

        fireEvent.change(screen.getByLabelText('Your own answer'), {
            target: { value: 'Q4 2022' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('checkbox', { name: /Revenue/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }));

        expect(onSubmit).toHaveBeenCalledWith({
            text: 'Period: Q4 2022\nMetrics: Revenue',
            typedAnswerCount: 1,
        });
    });

    it('keeps a picked option when the next answer is typed', () => {
        const onSubmit = renderCard([period, metrics]);

        fireEvent.click(screen.getByRole('radio', { name: /November 2022/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.change(screen.getByLabelText('Your own answer'), {
            target: { value: 'Margin' },
        });
        fireEvent.keyDown(screen.getByLabelText('Your own answer'), {
            key: 'Enter',
        });

        expect(onSubmit).toHaveBeenCalledWith({
            text: 'Period: November 2022\nMetrics: Margin',
            typedAnswerCount: 1,
        });
    });
});
