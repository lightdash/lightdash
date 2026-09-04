import {
    type ApiSaveExternalConnectionSampleRequest,
    type ExternalConnection,
    type ExternalFetchResponse,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionExamplesPanel } from './ConnectionExamplesPanel';
import { EditConnectionModal } from './EditConnectionModal';

const mocks = vi.hoisted(() => ({
    test: vi.fn(),
    resetTest: vi.fn(),
    saveSample: vi.fn(),
    testResult: undefined as ExternalFetchResponse | undefined,
}));

vi.mock(
    '../../../features/externalConnections/hooks/useConnectionSamples',
    () => ({ useConnectionSamples: () => ({ data: [] }) }),
);
vi.mock(
    '../../../features/externalConnections/hooks/useDeleteConnectionSample',
    () => ({
        useDeleteConnectionSample: () => ({
            mutate: vi.fn(),
            isLoading: false,
        }),
    }),
);
vi.mock(
    '../../../features/externalConnections/hooks/useSaveConnectionSample',
    () => ({
        useSaveConnectionSample: () => ({
            mutate: mocks.saveSample,
            mutateAsync: mocks.saveSample,
            isLoading: false,
        }),
    }),
);
vi.mock(
    '../../../features/externalConnections/hooks/useUpdateExternalConnection',
    () => ({
        useUpdateExternalConnection: () => ({
            mutateAsync: vi.fn(),
            isLoading: false,
        }),
    }),
);
vi.mock(
    '../../../features/externalConnections/hooks/useTestConnection',
    () => ({
        useTestConnection: () => ({
            mutate: mocks.test,
            reset: mocks.resetTest,
            isLoading: false,
            data: mocks.testResult,
        }),
    }),
);
const connection: ExternalConnection = {
    externalConnectionUuid: 'connection-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'organization-uuid',
    name: 'Example API',
    slug: 'example-api',
    type: 'none',
    origin: 'https://api.example.com',
    allowBrowserImages: false,
    allowDataAppBuilderLinking: false,
    instructions: null,
    allowedPathPrefixes: ['/'],
    allowedMethods: ['GET'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 1_048_576,
    requestMaxBytes: 262_144,
    timeoutMs: 10_000,
    rateLimitPerMinute: null,
    apiKeyName: null,
    apiKeyLocation: null,
    oauthScopes: null,
    customHeaders: null,
    hasSecret: false,
    createdByUserUuid: 'user-uuid',
    updatedByUserUuid: 'user-uuid',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const panel = (
    config: UpdateExternalConnection,
    onQueueSample: (sample: ApiSaveExternalConnectionSampleRequest) => void,
) => (
    <MantineProvider env="test">
        <ConnectionExamplesPanel
            projectUuid="project-uuid"
            connection={connection}
            config={config}
            configFingerprint={JSON.stringify(config)}
            hasUnsavedChanges
            isSampleQueued={false}
            onQueueSample={onQueueSample}
            onClearQueuedSample={vi.fn()}
        />
    </MantineProvider>
);

const renderPanel = (
    allowedMethods: ExternalConnection['allowedMethods'],
    onQueueSample = vi.fn(),
) => {
    const result = render(panel({ allowedMethods }, onQueueSample));
    return {
        ...result,
        onQueueSample,
        rerenderWithConfig: (config: UpdateExternalConnection) =>
            result.rerender(panel(config, onQueueSample)),
    };
};

describe('ConnectionExamplesPanel draft config', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.testResult = undefined;
    });

    it('only offers methods allowed by the draft config', () => {
        renderPanel(['GET']);

        fireEvent.click(screen.getByRole('textbox', { name: 'Method' }));

        expect(screen.getByRole('option', { name: 'GET' })).toBeInTheDocument();
        expect(
            screen.queryByRole('option', { name: 'POST' }),
        ).not.toBeInTheDocument();
    });

    it('clamps the request method and sends the unsaved config', () => {
        renderPanel(['POST']);

        expect(screen.getByRole('textbox', { name: 'Method' })).toHaveValue(
            'POST',
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Send test request' }),
        );

        expect(mocks.test).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-uuid',
                connectionUuid: 'connection-uuid',
                config: { allowedMethods: ['POST'] },
                method: 'POST',
                path: '/',
            }),
        );
    });

    it('does not render a request runner for an image-only draft', () => {
        renderPanel([]);

        expect(
            screen.getByText(
                'This image-only connection does not allow proxied requests, so there is nothing to test here.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('textbox', { name: 'Method' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Saved samples')).toBeInTheDocument();
    });

    it('queues a successful draft-based sample instead of saving it immediately', () => {
        mocks.testResult = {
            status: 200,
            contentType: 'application/json',
            headers: {},
            body: { id: 1 },
            truncated: false,
        };
        const onQueueSample = vi.fn();
        renderPanel(['GET'], onQueueSample);

        fireEvent.click(
            screen.getByRole('button', { name: 'Send test request' }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Save with connection' }),
        );

        expect(onQueueSample).toHaveBeenCalledWith({
            label: null,
            request: { method: 'GET', path: '/', query: undefined },
            response: { id: 1 },
        });
        expect(mocks.saveSample).not.toHaveBeenCalled();
    });

    it('does not expose a test result produced with an older draft config', () => {
        mocks.testResult = {
            status: 200,
            contentType: 'application/json',
            headers: {},
            body: { id: 1 },
            truncated: false,
        };
        const onQueueSample = vi.fn();
        const { rerenderWithConfig } = renderPanel(['GET'], onQueueSample);

        fireEvent.click(
            screen.getByRole('button', { name: 'Send test request' }),
        );
        expect(
            screen.getByRole('button', { name: 'Save with connection' }),
        ).toBeInTheDocument();

        rerenderWithConfig({
            origin: 'https://api.other-example.com',
            allowedMethods: ['GET'],
        });

        expect(
            screen.queryByRole('button', { name: 'Save with connection' }),
        ).not.toBeInTheDocument();
        expect(onQueueSample).not.toHaveBeenCalled();
    });

    it('keeps the example path when switching tabs', () => {
        render(
            <MantineProvider env="test">
                <EditConnectionModal
                    opened
                    onClose={vi.fn()}
                    projectUuid="project-uuid"
                    connection={connection}
                />
            </MantineProvider>,
        );

        fireEvent.click(screen.getByRole('tab', { name: 'Examples' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Path' }), {
            target: { value: '/v1/drivers' },
        });

        fireEvent.click(screen.getByRole('tab', { name: 'Instructions' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Examples' }));

        expect(screen.getByRole('textbox', { name: 'Path' })).toHaveValue(
            '/v1/drivers',
        );
    });
});
