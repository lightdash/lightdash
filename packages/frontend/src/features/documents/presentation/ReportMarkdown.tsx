import { useMemo, type ReactNode } from 'react';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { type StreamdownProps } from 'streamdown';
import { AiMarkdown } from '../../../components/common/AiMarkdown/AiMarkdown';
import Callout from '../../../components/common/Callout';
import styles from './ReportPresentation.module.css';
import { ReportSectionHeading } from './ReportSection';

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
}: {
    markdown: string;
    className?: string;
    components?: StreamdownProps['components'];
}) => {
    const mergedComponents = useMemo<StreamdownProps['components']>(
        () => ({
            ...CALLOUT_COMPONENTS,
            h1: ({ children }) => (
                <ReportSectionHeading order={1} standalone>
                    {children}
                </ReportSectionHeading>
            ),
            h2: ({ children }) => (
                <ReportSectionHeading standalone>
                    {children}
                </ReportSectionHeading>
            ),
            ...components,
        }),
        [components],
    );

    return (
        <AiMarkdown
            className={`${className} ${styles.reportMarkdown}`}
            rehypePlugins={REHYPE_PLUGINS}
            components={mergedComponents}
        >
            {markdown}
        </AiMarkdown>
    );
};

export default ReportMarkdown;
