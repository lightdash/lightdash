import { MantineProvider } from '@mantine/core';
import { act, render, screen } from '@testing-library/react';
import { HomepageTour } from './HomepageTour';
import { HOMEPAGE_TOUR_STORAGE_KEY } from './homepageTourStorage';

const addTarget = (name: string) => {
    const element = document.createElement('div');
    element.dataset.tour = name;
    document.body.appendChild(element);
    return element;
};

describe('HomepageTour', () => {
    beforeEach(() => localStorage.removeItem(HOMEPAGE_TOUR_STORAGE_KEY));
    afterEach(() => {
        document
            .querySelectorAll('[data-tour]')
            .forEach((element) => element.remove());
    });

    it('follows targets that mount or unmount after the tour opens', async () => {
        const ask = addTarget('home-ask');
        render(
            <MantineProvider env="test">
                <HomepageTour ready />
            </MantineProvider>,
        );
        expect(await screen.findByText('Ask anything')).toBeInTheDocument();

        await act(async () => {
            addTarget('home-setup');
            ask.remove();
        });
        expect(
            await screen.findByText('Finish setting up'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Ask anything')).not.toBeInTheDocument();
    });
});
