import { type FC } from 'react';
import Page from '../components/common/Page/Page';
import { ReleasesTimeline } from '../components/ReleasesTimeline';

/**
 * Public releases page showing the release history timeline.
 * This page is unauthenticated and can be accessed by anyone with the URL.
 * Useful for hosting teams and customer support to verify deployment versions.
 */
const Releases: FC = () => {
    return (
        <Page
            title="Releases"
            withNavbar={false}
            withFullHeight
            withCenteredContent={false}
        >
            <ReleasesTimeline />
        </Page>
    );
};

export default Releases;
