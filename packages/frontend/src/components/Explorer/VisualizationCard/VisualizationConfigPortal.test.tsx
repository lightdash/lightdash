import { Button } from '@mantine/core';
import { screen, waitFor } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import Page from '../../common/Page/Page';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';
import useVisualizationConfigPortalTarget from './useVisualizationConfigPortalTarget';
import VisualizationConfigPortal from './VisualizationConfigPortal';

const PortalProducer = ({ isOpen }: { isOpen: boolean }) => {
    const { target, ref } = useVisualizationConfigPortalTarget(isOpen);

    return (
        <>
            <Button ref={ref}>Configure</Button>
            {target && createPortal(<div>Configure content</div>, target)}
        </>
    );
};

describe('VisualizationConfigPortal', () => {
    it('renders configure content inside an open shadow root', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const container = document.createElement('div');
        shadowRoot.appendChild(container);
        const renderPortal = (isOpen: boolean) => (
            <>
                <VisualizationConfigPortal />
                <PortalProducer isOpen={isOpen} />
            </>
        );
        const { unmount, rerender } = renderWithProviders(
            renderPortal(true),
            undefined,
            { container },
        );

        try {
            await waitFor(() => {
                expect(
                    shadowRoot.getElementById(VisualizationConfigPortalId),
                ).toHaveTextContent('Configure content');
            });

            rerender(renderPortal(false));
            expect(
                shadowRoot.getElementById(VisualizationConfigPortalId),
            ).toBeEmptyDOMElement();

            rerender(renderPortal(true));
            await waitFor(() => {
                expect(
                    shadowRoot.getElementById(VisualizationConfigPortalId),
                ).toHaveTextContent('Configure content');
            });
        } finally {
            unmount();
            host.remove();
        }
    });

    it('tracks late and replaced shadow hosts without using a document host', async () => {
        const documentTarget = document.createElement('div');
        documentTarget.id = VisualizationConfigPortalId;
        document.body.appendChild(documentTarget);
        const shadowRoot = documentTarget.attachShadow({ mode: 'open' });
        const container = document.createElement('div');
        shadowRoot.appendChild(container);
        const { unmount } = renderWithProviders(
            <PortalProducer isOpen />,
            undefined,
            { container },
        );

        try {
            expect(documentTarget).toBeEmptyDOMElement();

            const lateTarget = document.createElement('div');
            lateTarget.id = VisualizationConfigPortalId;
            shadowRoot.appendChild(lateTarget);
            await waitFor(() => {
                expect(lateTarget).toHaveTextContent('Configure content');
            });

            const replacementTarget = document.createElement('div');
            replacementTarget.id = VisualizationConfigPortalId;
            lateTarget.replaceWith(replacementTarget);
            await waitFor(() => {
                expect(replacementTarget).toHaveTextContent(
                    'Configure content',
                );
            });
            expect(lateTarget).toBeEmptyDOMElement();
            expect(documentTarget).toBeEmptyDOMElement();
        } finally {
            unmount();
            documentTarget.remove();
        }
    });

    it('is mounted before the transitioned right sidebar opens', () => {
        renderWithProviders(
            <Page
                withNavbar={false}
                rightSidebar={<VisualizationConfigPortal />}
                isRightSidebarOpen={false}
                keepRightSidebarMounted
            >
                <div>Chart</div>
            </Page>,
        );

        expect(
            document.getElementById(VisualizationConfigPortalId),
        ).not.toBeNull();
    });

    it('keeps portal content attached when the right sidebar opens', async () => {
        const renderPage = (isOpen: boolean) => (
            <Page
                withNavbar={false}
                rightSidebar={<VisualizationConfigPortal />}
                isRightSidebarOpen={isOpen}
                keepRightSidebarMounted
            >
                <PortalProducer isOpen={isOpen} />
            </Page>
        );
        const { rerender } = renderWithProviders(renderPage(false));

        rerender(renderPage(true));

        expect(
            await screen.findByText('Configure content'),
        ).toBeInTheDocument();
    });

    it('retargets content when the portal host is replaced', async () => {
        renderWithProviders(
            <Page
                withNavbar={false}
                rightSidebar={<VisualizationConfigPortal />}
                isRightSidebarOpen
                keepRightSidebarMounted
            >
                <PortalProducer isOpen />
            </Page>,
        );
        const originalTarget = document.getElementById(
            VisualizationConfigPortalId,
        );
        const replacementTarget = document.createElement('div');
        replacementTarget.id = VisualizationConfigPortalId;

        originalTarget?.replaceWith(replacementTarget);

        try {
            expect(
                await screen.findByText('Configure content'),
            ).toBeInTheDocument();
            expect(replacementTarget).toContainElement(
                screen.getByText('Configure content'),
            );
        } finally {
            // Restore the React-owned host before React unmounts the tree.
            if (originalTarget) replacementTarget.replaceWith(originalTarget);
        }
    });

    it('finds a host that mounts after the config opens', async () => {
        renderWithProviders(
            <Page withNavbar={false} isRightSidebarOpen={false}>
                <PortalProducer isOpen />
            </Page>,
        );
        expect(document.getElementById(VisualizationConfigPortalId)).toBeNull();

        const lateHost = document.createElement('div');
        lateHost.id = VisualizationConfigPortalId;
        document.body.appendChild(lateHost);

        expect(
            await screen.findByText('Configure content'),
        ).toBeInTheDocument();
        expect(lateHost).toContainElement(
            screen.getByText('Configure content'),
        );

        lateHost.remove();
    });
});
