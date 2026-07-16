import { ContentType } from '@lightdash/common';
import { type FC } from 'react';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown/AiMarkdown';
import { rehypeAiAgentContentLinks } from '../../../aiCopilot/components/ChatElements/rehypeContentLinks';
import { AnnouncementMentionChip } from './AnnouncementMentionChip';

type Props = {
    projectUuid: string;
    text: string;
};

export const AnnouncementContent: FC<Props> = ({ projectUuid, text }) => (
    <AiMarkdown
        rehypePlugins={[rehypeAiAgentContentLinks]}
        components={{
            a: ({ children, ...props }) => {
                const rest = props as Record<string, unknown>;
                const contentType = rest['data-content-type'];
                const chartUuid = rest['data-chart-uuid'];
                const dashboardUuid = rest['data-dashboard-uuid'];
                const label =
                    typeof children === 'string' ? children : String(children);

                if (
                    contentType === 'chart-link' &&
                    typeof chartUuid === 'string'
                ) {
                    return (
                        <AnnouncementMentionChip
                            projectUuid={projectUuid}
                            contentType={ContentType.CHART}
                            uuid={chartUuid}
                            label={label}
                        />
                    );
                }
                if (
                    contentType === 'dashboard-link' &&
                    typeof dashboardUuid === 'string'
                ) {
                    return (
                        <AnnouncementMentionChip
                            projectUuid={projectUuid}
                            contentType={ContentType.DASHBOARD}
                            uuid={dashboardUuid}
                            label={label}
                        />
                    );
                }
                return (
                    <a {...props} target="_blank" rel="noreferrer">
                        {children}
                    </a>
                );
            },
        }}
    >
        {text}
    </AiMarkdown>
);
