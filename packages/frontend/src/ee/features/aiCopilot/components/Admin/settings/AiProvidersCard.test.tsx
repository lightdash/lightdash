import { screen, waitFor } from '@testing-library/react';
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
    },
];

const renderCard = (props?: {
    onUpdateKeys?: () => void;
    bedrockConfig?: { region: string; allowedModels: string[] } | null;
}) =>
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
            bedrockConfig={props?.bedrockConfig ?? null}
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

    it('offers Bedrock with a region, a key and allowed models', () => {
        renderCard();

        expect(screen.getByText('Amazon Bedrock')).toBeInTheDocument();
        expect(
            screen.getByRole('combobox', { name: 'AWS region' }),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText('Bedrock API key', { selector: 'input' }),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText('Bedrock allowed models'),
        ).toBeInTheDocument();
    });

    it('saves region, key and allowed models together', async () => {
        const onUpdateKeys = vi.fn();
        renderCard({ onUpdateKeys });

        await userEvent.click(
            screen.getByRole('combobox', { name: 'AWS region' }),
        );
        await userEvent.click(
            screen.getByText('Asia Pacific (Tokyo) — ap-northeast-1'),
        );
        await userEvent.type(
            screen.getByLabelText('Bedrock API key', { selector: 'input' }),
            'ABSKtest',
        );
        await userEvent.click(screen.getByLabelText('Bedrock allowed models'));
        await userEvent.click(screen.getByText('Claude Sonnet 4.5'));
        await userEvent.click(
            screen.getByRole('button', { name: 'Set configuration' }),
        );

        await waitFor(() =>
            expect(onUpdateKeys).toHaveBeenCalledWith({
                bedrock: {
                    region: 'ap-northeast-1',
                    allowedModels: ['claude-sonnet-4-5'],
                    apiKey: 'ABSKtest',
                },
            }),
        );
    });

    it('reports what is missing instead of saving an incomplete config', async () => {
        const onUpdateKeys = vi.fn();
        renderCard({ onUpdateKeys });

        await userEvent.click(
            screen.getByRole('button', { name: 'Set configuration' }),
        );

        expect(
            await screen.findByText('Select an AWS region'),
        ).toBeInTheDocument();
        expect(screen.getByText('Enter a Bedrock API key')).toBeInTheDocument();
        expect(
            screen.getByText('Select at least one model'),
        ).toBeInTheDocument();
        expect(onUpdateKeys).not.toHaveBeenCalled();
    });

    it('keeps the stored key when only the region changes', async () => {
        const onUpdateKeys = vi.fn();
        renderCard({
            onUpdateKeys,
            bedrockConfig: {
                region: 'ap-northeast-1',
                allowedModels: ['claude-sonnet-4-5'],
            },
        });

        await userEvent.click(
            screen.getByRole('combobox', { name: 'AWS region' }),
        );
        await userEvent.click(
            screen.getByText('US East (N. Virginia) — us-east-1'),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Update' }));

        await waitFor(() =>
            expect(onUpdateKeys).toHaveBeenCalledWith({
                bedrock: {
                    region: 'us-east-1',
                    allowedModels: ['claude-sonnet-4-5'],
                },
            }),
        );
    });
});
