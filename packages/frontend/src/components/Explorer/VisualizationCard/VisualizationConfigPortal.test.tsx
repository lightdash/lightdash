import { screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import Page from '../../common/Page/Page';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';
import useVisualizationConfigPortalTarget from './useVisualizationConfigPortalTarget';
import VisualizationConfigPortal from './VisualizationConfigPortal';

const PortalProducer = ({ isOpen }: { isOpen: boolean }) => {
    const target = useVisualizationConfigPortalTarget(isOpen);

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
});
