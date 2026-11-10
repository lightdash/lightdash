import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        supersededBy: null,
    },
];

const GEMINI_MODEL = {
    name: 'gemini-3.8-flash',
    provider: 'google' as const,
    displayName: 'Gemini 3.8 Flash',
    description: 'Gemini model',
    modelId: 'gemini-3.8-flash',
    default: true,
    supportsReasoning: true,
    deprecated: false,
    supersededBy: null,
};

const OPENAI_MODEL = {
    name: 'gpt-6-sol',
    provider: 'openai' as const,
    displayName: 'GPT-6 Sol',
    description: 'OpenAI model',
    modelId: 'gpt-6-sol',
    default: false,
    supportsReasoning: true,
    deprecated: false,
    supersededBy: null,
};

const renderCard = (props?: {
    onUpdateKeys?: () => void;
    openaiKeySet?: boolean;
    anthropicKeySet?: boolean;
    configurableModelOptions?: (typeof GEMINI_MODEL | typeof OPENAI_MODEL)[];
}) =>
    renderWithProviders(
        <AiProvidersCard
            providerApiKeysSet={{
                anthropic: props?.anthropicKeySet ?? false,
                google: false,
                openai: props?.openaiKeySet ?? false,
                bedrock: false,
            }}
            providerApiKeyHints={{
                anthropic: null,
                google: null,
                openai: null,
                bedrock: null,
            }}
            modelVisibility={null}
            configurableModelOptions={
                props?.configurableModelOptions ?? [GEMINI_MODEL]
            }
            dataAppModelVisibility={null}
            showDataAppModels={false}
            bedrockModelOptions={BEDROCK_MODELS}
            providerBaseUrls={{
                anthropic: null,
                google: null,
                openai: null,
            }}
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

    it('shows the custom base URL input only once a key is set', () => {
        renderCard();
        expect(
            screen.queryByLabelText('Custom base URL'),
        ).not.toBeInTheDocument();

        renderCard({ openaiKeySet: true });
        expect(screen.getByLabelText('Custom base URL')).toHaveAttribute(
            'placeholder',
            'https://ai-gateway.example.com/v1',
        );
    });

    it('keeps Save disabled and shows an error for an invalid URL', async () => {
        const user = userEvent.setup();
        const onUpdateKeys = vi.fn();
        renderCard({ onUpdateKeys, openaiKeySet: true });

        const input = screen.getByLabelText('Custom base URL');
        await user.type(input, 'https://user:pw@gateway.example.com{Enter}');

        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(
            screen.getByText(/without credentials, query parameters/),
        ).toBeInTheDocument();
        expect(onUpdateKeys).not.toHaveBeenCalled();
    });

    it('saves a custom base URL for the provider on Enter', async () => {
        const user = userEvent.setup();
        const onUpdateKeys = vi.fn();
        renderCard({ onUpdateKeys, openaiKeySet: true });

        const input = screen.getByLabelText('Custom base URL');
        await user.type(input, 'https://litellm.example.com/v1{Enter}');

        expect(onUpdateKeys).toHaveBeenCalledWith({
            providerBaseUrls: { openai: 'https://litellm.example.com/v1' },
        });
    });

    it('locks the availability toggle of the only provider with a key', () => {
        renderCard({
            openaiKeySet: true,
            configurableModelOptions: [GEMINI_MODEL, OPENAI_MODEL],
        });

        expect(
            screen.getByLabelText('OpenAI available to users'),
        ).toBeDisabled();
        expect(
            screen.getByText(/only provider your organization has a key for/),
        ).toBeInTheDocument();
    });

    it('keeps the availability toggle usable once a second key is set', () => {
        renderCard({
            openaiKeySet: true,
            anthropicKeySet: true,
            configurableModelOptions: [GEMINI_MODEL, OPENAI_MODEL],
        });

        expect(
            screen.getByLabelText('OpenAI available to users'),
        ).toBeEnabled();
        expect(
            screen.queryByText(/only provider your organization has a key for/),
        ).not.toBeInTheDocument();
    });
});
