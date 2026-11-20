import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderWithProviders } from '../../../testing/testUtils';
import ClarificationStepper from './ClarificationStepper';

const Harness = () => {
    const [answers, setAnswers] = useState(['']);
    return (
        <ClarificationStepper
            questions={[{ question: 'Which area?', options: ['Sales'] }]}
            answers={answers}
            onAnswer={(_, value) => setAnswers([value])}
            onSkip={() => undefined}
            onBuild={() => undefined}
        />
    );
};

describe('ClarificationStepper', () => {
    it('keeps a typed answer that starts with a suggestion', async () => {
        renderWithProviders(<Harness />);
        const input = screen.getByPlaceholderText('Or type your own answer');

        await userEvent.type(input, 'Sales by region');

        expect(input).toHaveValue('Sales by region');
    });
});
