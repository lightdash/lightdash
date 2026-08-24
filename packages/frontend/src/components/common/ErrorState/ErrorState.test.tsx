import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import ErrorState from '.';

describe('ErrorState', () => {
    test('renders every candidate for a split explore', () => {
        render(
            <MantineProvider>
                <ErrorState
                    error={{
                        name: 'NotFoundError',
                        statusCode: 404,
                        message:
                            'Explore "orders" was split. Pick a replacement.',
                        data: {
                            exploreName: 'orders',
                            candidateExploreNames: [
                                'sourceA__orders',
                                'sourceB__orders',
                            ],
                        },
                    }}
                />
            </MantineProvider>,
        );

        expect(screen.getByText('Explore was split')).toBeInTheDocument();
        expect(screen.getByText('sourceA__orders')).toBeInTheDocument();
        expect(screen.getByText('sourceB__orders')).toBeInTheDocument();
    });
});
