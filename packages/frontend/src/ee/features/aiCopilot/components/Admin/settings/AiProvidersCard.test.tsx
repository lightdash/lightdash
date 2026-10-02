import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiProvidersCard } from './AiProvidersCard';

const BEDROCK_MODELS = [
    {
        name: 'claude-sonnet-4-5',
        provider: 'bedrock' as const,
        displayName: 'Claude Sonnet 4.5',
        description: 'Bedrock model',
        modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
        default: false,
        supportsReasoning: true,
        deprecated: false,
    },
];

const renderCard = (props?: { onUpdateKeys?: () => void }) =>
    renderWithProviders(
        <AiProvidersCard
            providerApiKeysSet={{
                anthropic: false,
                google: false,
                openai: false,
                bedrock: false,
            }}
            providerApiKeyHints={{
                anthropic: null,
                google: null,
                openai: null,
                bedrock: null,
            }}
            modelVisibility={null}
            configurableModelOptions={[
                {
                    name: 'gemini-3.8-flash',
                    provider: 'google',
                    displayName: 'Gemini 3.8 Flash',
                    description: 'Gemini model',
                    modelId: 'gemini-3.8-flash',
                    default: true,
                    supportsReasoning: true,
                    deprecated: false,
                },
            ]}
            dataAppModelVisibility={null}
            showDataAppModels={false}
            bedrockModelOptions={BEDROCK_MODELS}
            disabled={false}
            onUpdateKeys={props?.onUpdateKeys ?? vi.fn()}
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
