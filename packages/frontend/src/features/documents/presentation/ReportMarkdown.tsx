import { Box } from '@mantine/core';
import { useMemo, type ReactNode } from 'react';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { type StreamdownProps } from 'streamdown';
import { AiMarkdown } from '../../../components/common/AiMarkdown/AiMarkdown';
import Callout from '../../../components/common/Callout';
import rehypeReportSections from './rehypeReportSections';
import styles from './ReportPresentation.module.css';
import ReportSection, { ReportSectionHeading } from './ReportSection';

const REHYPE_PLUGINS: StreamdownProps['rehypePlugins'] = [
    rehypeRaw,
    [
        rehypeSanitize,
        {
            ...defaultSchema,
            tagNames: [
                ...(defaultSchema.tagNames ?? []).filter(
                    (tag) => tag !== 'img',
                ),
                'note',
                'info',
                'warning',
                'tip',
            ],
            attributes: {
                ...defaultSchema.attributes,
                note: ['title'],
                info: ['title'],
                warning: ['title'],
                tip: ['title'],
            },
        },
    ],
];

const renderCallout =
    (variant: 'info' | 'warning' | 'success', hideIcon = false) =>
    ({ children, title }: Record<string, unknown>) => (
        <Callout
            variant={variant}
            hideIcon={hideIcon}
            my="md"
            title={typeof title === 'string' ? title : undefined}
        >
            {children as ReactNode}
        </Callout>
    );

const CALLOUT_COMPONENTS: StreamdownProps['components'] = {
    note: renderCallout('info', true),
    info: renderCallout('info'),
    warning: renderCallout('warning'),
    tip: renderCallout('success'),
};

const ReportMarkdown = ({
    markdown,
    className = styles.reportProse,
    components,
    headingId,
}: {
    markdown: string;
    className?: string;
    components?: StreamdownProps['components'];
    headingId?: (offset: number) => string;
}) => {
    const mergedComponents = useMemo<StreamdownProps['components']>(
        () => ({
            ...CALLOUT_COMPONENTS,
            'report-narrative': ({ children }: Record<string, unknown>) => (
                <Box className={styles.reportNarrative}>
                    {children as ReactNode}
                </Box>
            ),
            'report-section': ({ children }: Record<string, unknown>) => (
                <ReportSection>{children as ReactNode}</ReportSection>
            ),
            'report-introduction': ({ children }: Record<string, unknown>) => (
                <ReportSection variant="introduction">
                    {children as ReactNode}
                </ReportSection>
            ),
            h1: ({ node, children }) => (
                <ReportSectionHeading
                    order={1}
                    standalone={!headingId}
                    id={headingId?.(node?.position?.start.offset ?? 0)}
                >
                    {children}
                </ReportSectionHeading>
            ),
            h2: ({ node, children }) => (
                <ReportSectionHeading
                    standalone={!headingId}
                    id={headingId?.(node?.position?.start.offset ?? 0)}
                >
                    {children}
                </ReportSectionHeading>
            ),
            ...components,
        }),
        [components, headingId],
    );

    const rehypePlugins = useMemo<StreamdownProps['rehypePlugins']>(
        () =>
            headingId
                ? [...(REHYPE_PLUGINS ?? []), rehypeReportSections]
                : REHYPE_PLUGINS,
        [headingId],
    );

    return (
        <AiMarkdown
            className={`${className} ${styles.reportMarkdown}`}
            rehypePlugins={rehypePlugins}
            components={mergedComponents}
        >
            {markdown}
        </AiMarkdown>
    );
};

export default ReportMarkdown;
