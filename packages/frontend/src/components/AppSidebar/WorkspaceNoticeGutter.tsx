import { assertUnreachable } from '@lightdash/common';
import { IconClock, IconTestPipe } from '@tabler/icons-react';
import { type FC } from 'react';
import { type WorkspaceNotice } from '../NavBar/useNavBarState';
import { NoticeGutter } from './NoticeGutter';
import { PreviewGutter } from './PreviewGutter';

type Props = {
    notice: WorkspaceNotice;
    isSidebarCollapsed: boolean;
};

/** The workspace's notice, as the strip above the page draws it. */
export const WorkspaceNoticeGutter: FC<Props> = ({
    notice,
    isSidebarCollapsed,
}) => {
    switch (notice.type) {
        case 'preview':
            return (
                <PreviewGutter
                    previewName={notice.previewName}
                    expiresAt={notice.expiresAt}
                    upstreamProject={notice.upstreamProject}
                    isSidebarCollapsed={isSidebarCollapsed}
                />
            );
        case 'trial':
            return (
                <NoticeGutter
                    hint={null}
                    tone="warning"
                    icon={IconClock}
                    title="Trial ended"
                    detail={
                        notice.isExpired
                            ? 'Queries are disabled. Contact sales to reactivate.'
                            : 'Contact sales to keep your workspace'
                    }
                    action={{
                        type: 'external',
                        label: 'Contact sales',
                        href: 'mailto:sales@lightdash.com',
                    }}
                />
            );
        case 'sampleData':
            return (
                <NoticeGutter
                    hint={null}
                    tone="info"
                    icon={IconTestPipe}
                    title="Sample data"
                    detail="A demo project to look around in while you get set up"
                    action={{
                        type: 'link',
                        label: 'Connect your data',
                        to: '/onboarding/data-source',
                    }}
                />
            );
        default:
            return assertUnreachable(notice, 'Unknown workspace notice');
    }
};
