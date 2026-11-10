import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

const props = {
    warehouseName: 'Postgres',
    createContent: 'Create content',
    grantContent: 'Grant content',
    addHelp: 'Add help',
};

describe('AI service account setup guide', () => {
    it('shows three steps without a button', () => {
        renderWithProviders(<AiServiceAccountSetupGuide {...props} />);
        for (const title of [
            'Create the account in Postgres',
            'Grant it only the data agents may read',
            'Add it here and select Test',
        ])
            expect(screen.getByText(title)).toBeVisible();
        for (const content of [
            props.createContent,
            props.grantContent,
            props.addHelp,
        ])
            expect(screen.getByText(content)).toBeVisible();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(
            screen.queryByText('How to set up the shared agent account'),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText('Step 3')).toBeVisible();
    });
});
