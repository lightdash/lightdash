import Page from '../../../../components/common/Page/Page';
import { AiAgentsAdminLayout } from '../../../features/aiCopilot/components/Admin/AiAgentsAdminLayout';

export const AiAgentsAdminPage = () => {
    return (
        <Page
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
            backgroundColor="#FAFAFA"
        >
            <AiAgentsAdminLayout />
        </Page>
    );
};
