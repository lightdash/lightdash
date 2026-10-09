import {
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type ApiAiServiceAccountSaveResponse,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi, lightdashApiResponse } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import { SnowflakeAiServiceAccountForm } from './SnowflakeAiServiceAccountForm';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
    lightdashApiResponse: vi.fn(),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastApiError: vi.fn() }),
}));
const pem = '-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----';
const observation = {
    ok: true,
    principal: 'OBSERVED_USER',
    observed: { currentUser: 'OBSERVED_USER', currentRole: 'OBSERVED_ROLE' },
    message: 'Connection works.',
    checkedAt: new Date('2026-10-09T12:00:00Z'),
};
const slot = { identityUuid: 'generation' } as AiServiceAccountSlot;
class StubFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    abort = vi.fn();
    readAsText = vi.fn();
    constructor() {
        readers.push(this);
    }
}
let readers: StubFileReader[] = [];
const setup = () => {
    const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const view = renderWithProviders(
        <QueryClientProvider client={client}>
            <SnowflakeAiServiceAccountForm
                projectUuid="project"
                onClose={onClose}
                onSaved={onSaved}
            />
        </QueryClientProvider>,
    );
    return { ...view, client, onClose, onSaved };
};
const change = (label: string, value: string) =>
    fireEvent.change(
        screen.getByLabelText(label, {
            exact: false,
            selector: 'input, textarea',
        }),
        { target: { value } },
    );
const fill = () => {
    change('User', 'submitted_user');
    change('Role', 'submitted_role');
    change('Warehouse', 'warehouse');
    fireEvent.click(screen.getByLabelText('Paste key'));
    change('Private key', pem);
};
const upload = (name = 'agent.p8') =>
    fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: { files: [new File(['key'], name)] },
    });
const save = () => screen.getByRole('button', { name: 'Test and save' });
beforeEach(() => {
    vi.clearAllMocks();
    readers = [];
    vi.stubGlobal('FileReader', StubFileReader);
    vi.mocked(lightdashApi).mockResolvedValue(observation);
    vi.mocked(lightdashApiResponse).mockResolvedValue({
        status: 'ok',
        results: slot,
        verification: observation,
    } as ApiAiServiceAccountSaveResponse);
});
afterEach(() => vi.unstubAllGlobals());

describe('Snowflake AI service account form', () => {
    it.each(['Upload file', 'Paste key'])(
        'labels the private key before the mode control and %s input',
        (mode) => {
            setup();
            fireEvent.click(screen.getByLabelText(mode));
            const label = screen.getByText('Private key');
            const control = screen.getByLabelText('Private key input');
            const input = screen.getByLabelText('Private key', {
                exact: false,
                selector: mode === 'Paste key' ? 'textarea' : 'button',
            });
            expect(input).toHaveAccessibleName('Private key');
            expect(label.compareDocumentPosition(control)).toBe(
                Node.DOCUMENT_POSITION_FOLLOWING,
            );
            expect(control.compareDocumentPosition(input)).toBe(
                Node.DOCUMENT_POSITION_FOLLOWING,
            );
        },
    );
    it('requires a user, role, warehouse and PEM private key', () => {
        setup();
        expect(save()).toBeDisabled();
        fill();
        expect(save()).toBeEnabled();
        for (const label of ['User', 'Role', 'Warehouse', 'Private key']) {
            const field = screen.getByLabelText(label, {
                exact: false,
                selector: 'input, textarea',
            }) as HTMLInputElement;
            const previous = field.value;
            change(label, ' ');
            expect(save()).toBeDisabled();
            change(label, previous);
        }
        change(
            'Private key',
            '-----BEGIN PUBLIC KEY-----\nYWJj\n-----END PUBLIC KEY-----',
        );
        expect(save()).toBeDisabled();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
    it('saves without a prior Test and returns the server observation', async () => {
        const { onSaved, onClose } = setup();
        fill();
        fireEvent.click(save());
        await waitFor(() =>
            expect(onSaved).toHaveBeenCalledWith(
                slot,
                'OBSERVED_USER · OBSERVED_ROLE',
                observation,
            ),
        );
        expect(lightdashApiResponse).toHaveBeenCalledWith({
            version: 'v2',
            url: '/projects/project/ai-access/service-account',
            method: 'PUT',
            sensitive: true,
            body: JSON.stringify({
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                user: 'submitted_user',
                privateKey: pem,
                privateKeyPass: null,
                role: 'submitted_role',
                warehouse: 'warehouse',
            }),
        });
        expect(lightdashApi).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });
    it.each([
        'User',
        'Role',
        'Warehouse',
        'Private key',
        'Passphrase (optional)',
    ])(
        'clears the submitted test observation when %s changes',
        async (label) => {
            setup();
            fill();
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(await screen.findByRole('status')).toHaveTextContent(
                'Signs in as OBSERVED_USER · OBSERVED_ROLE',
            );
            change(label, 'changed');
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
        },
    );
    it('sends exact values and explicitly clears an empty passphrase', async () => {
        setup();
        fill();
        change('Passphrase (optional)', ' spaces stay ');
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        await screen.findByRole('status');
        expect(lightdashApi).toHaveBeenLastCalledWith(
            expect.objectContaining({
                sensitive: true,
                body: JSON.stringify({
                    credentials: {
                        type: WarehouseTypes.SNOWFLAKE,
                        authenticationType:
                            SnowflakeAuthenticationType.PRIVATE_KEY,
                        user: 'submitted_user',
                        privateKey: pem,
                        privateKeyPass: ' spaces stay ',
                        role: 'submitted_role',
                        warehouse: 'warehouse',
                    },
                }),
            }),
        );
        change('Passphrase (optional)', '');
        fireEvent.click(save());
        await waitFor(() => expect(lightdashApiResponse).toHaveBeenCalled());
        expect(
            JSON.parse(
                vi.mocked(lightdashApiResponse).mock.calls[0][0].body as string,
            ).privateKeyPass,
        ).toBeNull();
    });
    it('retains all values on failure and disables modal actions while saving', async () => {
        let reject: (reason: unknown) => void = () => {};
        vi.mocked(lightdashApiResponse).mockImplementation(
            () =>
                new Promise((_, rejectRequest) => {
                    reject = rejectRequest;
                }),
        );
        const { onClose, onSaved } = setup();
        fill();
        change('Passphrase (optional)', 'secret');
        fireEvent.click(save());
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Checking and saving…' }),
            ).toBeDisabled(),
        );
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
        expect(
            screen.queryByRole('button', { name: 'Close' }),
        ).not.toBeInTheDocument();
        act(() => reject({ error: { message: 'Sign-in failed.' } }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Sign-in failed.',
        );
        expect(
            screen.getByLabelText('Private key', {
                exact: false,
                selector: 'input, textarea',
            }),
        ).toHaveValue(pem);
        expect(screen.getByLabelText('Passphrase (optional)')).toHaveValue(
            'secret',
        );
        expect(
            screen.getByLabelText('User', {
                exact: false,
                selector: 'input, textarea',
            }),
        ).toHaveValue('submitted_user');
        expect(onClose).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
        expect(save()).toBeEnabled();
    });
    it('reports a failed Test as an alert', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...observation,
            ok: false,
            principal: null,
            message: 'Access denied.',
        });
        setup();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Access denied.',
        );
    });
    it.each(['agent.p8', 'agent.pem'])(
        'reads %s and clears the file when switching to paste',
        (name) => {
            setup();
            change('User', 'user');
            change('Role', 'role');
            change('Warehouse', 'warehouse');
            upload(name);
            expect(save()).toBeDisabled();
            act(() => {
                readers[0].result = pem;
                readers[0].onload?.();
            });
            expect(save()).toBeEnabled();
            fireEvent.click(screen.getByLabelText('Paste key'));
            expect(
                screen.getByLabelText('Private key', {
                    exact: false,
                    selector: 'input, textarea',
                }),
            ).toHaveValue('');
            expect(save()).toBeDisabled();
            change('Private key', pem);
            fireEvent.click(screen.getByLabelText('Upload file'));
            expect(save()).toBeDisabled();
        },
    );
    it('ignores stale reads and reports file read errors', () => {
        setup();
        upload();
        const first = readers[0];
        upload('new.pem');
        expect(first.abort).toHaveBeenCalled();
        act(() => {
            first.result = pem;
            first.onload?.();
            readers[1].onerror?.();
        });
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Could not read the private key file.',
        );
        expect(save()).toBeDisabled();
    });
    it('ignores a pending file read after switching to paste or unmounting', () => {
        const { unmount } = setup();
        upload();
        const first = readers[0];
        fireEvent.click(screen.getByLabelText('Paste key'));
        change('Private key', pem);
        act(() => {
            first.result = 'stale';
            first.onload?.();
        });
        expect(
            screen.getByLabelText('Private key', {
                exact: false,
                selector: 'input, textarea',
            }),
        ).toHaveValue(pem);
        fireEvent.click(screen.getByLabelText('Upload file'));
        upload();
        unmount();
        expect(readers[1].abort).toHaveBeenCalled();
    });
    it('rejects other file extensions', () => {
        setup();
        upload('key.txt');
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Choose a .p8 or .pem file.',
        );
        expect(readers).toHaveLength(0);
    });
    it('clears secrets and mutation state when closed and reopened', async () => {
        const { client, unmount, onClose } = setup();
        fill();
        change('Passphrase (optional)', 'secret');
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        await screen.findByRole('status');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(
            screen.getByLabelText('Private key', {
                exact: false,
                selector: 'input, textarea',
            }),
        ).toHaveValue('');
        expect(screen.getByLabelText('Passphrase (optional)')).toHaveValue('');
        unmount();
        await waitFor(() =>
            expect(client.getMutationCache().getAll()).toHaveLength(0),
        );
        setup();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(save()).toBeDisabled();
    });
});
