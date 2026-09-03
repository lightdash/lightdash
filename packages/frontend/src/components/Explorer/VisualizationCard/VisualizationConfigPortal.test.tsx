import { screen, within } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import Page from '../../common/Page/Page';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';
import useVisualizationConfigPortalTarget from './useVisualizationConfigPortalTarget';
import VisualizationConfigPortal from './VisualizationConfigPortal';

const PortalProducer = ({
    isOpen,
    followHost = false,
}: {
    isOpen: boolean;
    followHost?: boolean;
}) => {
    const target = useVisualizationConfigPortalTarget(isOpen, { followHost });

    return target ? createPortal(<div>Configure content</div>, target) : null;
};

describe('VisualizationConfigPortal', () => {
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
                <PortalProducer isOpen followHost />
            </Page>,
        );
        const originalTarget = document.getElementById(
            VisualizationConfigPortalId,
        );
        const replacementTarget = document.createElement('div');
        replacementTarget.id = VisualizationConfigPortalId;

        originalTarget?.replaceWith(replacementTarget);

        expect(
            await screen.findByText('Configure content'),
        ).toBeInTheDocument();
        expect(replacementTarget).toContainElement(
            screen.getByText('Configure content'),
        );
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

    it('keeps the original target when not following the host', async () => {
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

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(replacementTarget).toBeEmptyDOMElement();
        expect(
            within(originalTarget!).queryByText('Configure content'),
        ).not.toBeNull();
    });
});
