import { ContentType } from '@lightdash/common';
import { useState, type FC } from 'react';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown/AiMarkdown';
import MantineModal from '../../../../../components/common/MantineModal';
import { rehypeAiAgentContentLinks } from '../../../aiCopilot/components/ChatElements/rehypeContentLinks';
import classes from './announcements.module.css';
import { AnnouncementMentionChip } from './AnnouncementMentionChip';

type Props = {
    projectUuid: string;
    text: string;
};

export const AnnouncementContent: FC<Props> = ({ projectUuid, text }) => {
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [lightboxAlt, setLightboxAlt] = useState<string>('');

    return (
        <>
            <AiMarkdown
                rehypePlugins={[rehypeAiAgentContentLinks]}
                components={{
                    a: ({ children, ...props }) => {
                        const rest = props as Record<string, unknown>;
                        const contentType = rest['data-content-type'];
                        const chartUuid = rest['data-chart-uuid'];
                        const dashboardUuid = rest['data-dashboard-uuid'];
                        const label =
                            typeof children === 'string'
                                ? children
                                : String(children);

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
                    img: ({ src, alt }) => (
                        <img
                            src={src}
                            alt={alt ?? ''}
                            className={classes.announcementImage}
                            onClick={() => {
                                if (typeof src === 'string') {
                                    setLightboxSrc(src);
                                    setLightboxAlt(alt ?? '');
                                }
                            }}
                        />
                    ),
                }}
            >
                {text}
            </AiMarkdown>
            {lightboxSrc && (
                <MantineModal
                    opened
                    onClose={() => setLightboxSrc(null)}
                    title={lightboxAlt || 'Image'}
                    size="auto"
                    withCloseButton
                >
                    <img
                        src={lightboxSrc}
                        alt={lightboxAlt}
                        className={classes.lightboxImage}
                    />
                </MantineModal>
            )}
        </>
    );
};
