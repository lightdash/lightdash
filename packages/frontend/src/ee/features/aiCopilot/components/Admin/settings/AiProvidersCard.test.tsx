import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiProvidersCard } from './AiProvidersCard';

const renderCard = () =>
    renderWithProviders(
        <AiProvidersCard
            providerApiKeysSet={{
                anthropic: false,
                google: false,
                openai: false,
            }}
            providerApiKeyHints={{
                anthropic: null,
                google: null,
                openai: null,
            }}
            modelVisibility={null}
            configurableModelOptions={[
                {
                    name: 'gemini-3.7-flash',
                    provider: 'google',
                    displayName: 'Gemini 3.7 Flash',
                    description: 'Gemini model',
                    modelId: 'gemini-3.7-flash',
                    default: true,
                    supportsReasoning: true,
                    deprecated: false,
                },
            ]}
            dataAppModelVisibility={null}
            showDataAppModels={false}
            disabled={false}
            onUpdateKeys={vi.fn()}
            onUpdateVisibility={vi.fn()}
            onUpdateDataAppVisibility={vi.fn()}
        />,
    );

describe('AiProvidersCard', () => {
    it('renders Google Gemini as a BYO provider without exposing a key', () => {
        renderCard();

        expect(screen.getByText('Google Gemini')).toBeInTheDocument();
        expect(screen.getByLabelText('Google Gemini')).toHaveAttribute(
            'placeholder',
            'AIza...',
        );
        expect(screen.queryByText('fake-gemini-key')).not.toBeInTheDocument();
    });
});
