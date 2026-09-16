import { useMemo, type ReactNode } from 'react';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { type StreamdownProps } from 'streamdown';
import { AiMarkdown } from '../../../components/common/AiMarkdown/AiMarkdown';
import Callout from '../../../components/common/Callout';
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
            h1: ({ node, children }) =>
                headingId ? (
                    <h1
                        id={headingId(node?.position?.start.offset ?? 0)}
                        data-report-heading=""
                    >
                        {children}
                    </h1>
                ) : (
                    <ReportSectionHeading order={1} standalone>
                        {children}
                    </ReportSectionHeading>
                ),
            h2: ({ children }) =>
                headingId ? (
                    <h2>{children}</h2>
                ) : (
                    <ReportSectionHeading standalone>
                        {children}
                    </ReportSectionHeading>
                ),
            ...components,
        }),
        [components, headingId],
    );

    const content = (
        <AiMarkdown
            className={`${className} ${styles.reportMarkdown} ${headingId ? styles.documentMarkdown : ''}`}
            rehypePlugins={REHYPE_PLUGINS}
            components={mergedComponents}
        >
            {markdown}
        </AiMarkdown>
    );

    return headingId ? <ReportSection>{content}</ReportSection> : content;
};

export default ReportMarkdown;
