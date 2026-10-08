import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { BigQueryKeyFileInput } from './BigQueryKeyFileInput';

const Input = ({
    onKeyfileChange,
}: {
    onKeyfileChange: (value: Record<string, string> | null) => void;
}) => {
    const [file, setFile] = useState<File | null>(null);
    return (
        <BigQueryKeyFileInput
            value={file}
            onChange={setFile}
            onKeyfileChange={onKeyfileChange}
        />
    );
};

const upload = (contents: string) => {
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
        target: {
            files: [
                new File([contents], 'account.json', {
                    type: 'application/json',
                }),
            ],
        },
    });
};

describe('BigQueryKeyFileInput', () => {
    it('reads a service account without rendering any credentials', async () => {
        const onChange = vi.fn();
        renderWithProviders(<Input onKeyfileChange={onChange} />);
        const key = {
            type: 'service_account',
            client_email: 'hidden@example.test',
            private_key: 'hidden-key',
        };
        upload(JSON.stringify(key));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(key));
        expect(
            screen.queryByText(/hidden@example|hidden-key/),
        ).not.toBeInTheDocument();
    });
    it.each(['{"type":"authorized_user"}', '{}', 'null', '[]'])(
        'rejects non-service-account contents %s',
        async (contents) => {
            const onChange = vi.fn();
            renderWithProviders(<Input onKeyfileChange={onChange} />);
            upload(contents);
            expect(
                await screen.findByText('Use a service account key file.'),
            ).toBeInTheDocument();
            expect(onChange).toHaveBeenLastCalledWith(null);
        },
    );
    it('handles invalid JSON without exposing its content', async () => {
        renderWithProviders(<Input onKeyfileChange={vi.fn()} />);
        upload('invalid-secret-json');
        expect(
            await screen.findByText('Use a valid JSON key file.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/invalid-secret-json/),
        ).not.toBeInTheDocument();
    });
    it('clears a previously valid key when another file is invalid', async () => {
        const onChange = vi.fn();
        renderWithProviders(<Input onKeyfileChange={onChange} />);
        upload('{"type":"service_account"}');
        await waitFor(() =>
            expect(onChange).toHaveBeenLastCalledWith({
                type: 'service_account',
            }),
        );
        upload('{}');
        expect(
            await screen.findByText('Use a service account key file.'),
        ).toBeInTheDocument();
        expect(onChange).toHaveBeenLastCalledWith(null);
    });
});
