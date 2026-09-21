import { Box, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { TiptapMarkdownEditor } from '../../ee/features/homepageBuilder/blocks/markdownEditor/TiptapMarkdownEditor';
import { supportsRichTextEditing } from './documentMarkdown';
import { type ReportHeading } from './presentation/DocumentReportLayout';

const DocumentMarkdownEditor = ({
    markdown,
    onChange,
    disabled,
    headings,
}: {
    markdown: string;
    onChange: (markdown: string) => void;
    disabled: boolean;
    headings: ReportHeading[];
}) => {
    const richTextSupported = supportsRichTextEditing(markdown);
    const [mode, setMode] = useState(() =>
        richTextSupported ? 'text' : 'markdown',
    );
    const showRichText = mode === 'text' && richTextSupported;
    return (
        <Stack gap="xs">
            <SegmentedControl
                size="xs"
                value={showRichText ? 'text' : 'markdown'}
                disabled={disabled}
                onChange={setMode}
                data={[
                    {
                        label: 'Text',
                        value: 'text',
                        disabled: !richTextSupported,
                    },
                    { label: 'Markdown', value: 'markdown' },
                ]}
            />
            {!richTextSupported && (
                <Text size="xs" c="dimmed">
                    Edit this section as Markdown to preserve its formatting.
                </Text>
            )}
            {showRichText ? (
                <Box aria-label="Section text editor">
                    <TiptapMarkdownEditor
                        headingIds={headings.map((heading) => heading.id)}
                        content={markdown}
                        onChange={onChange}
                        editable={!disabled}
                    />
                </Box>
            ) : (
                <Box>
                    {headings.map((heading) => (
                        <Box
                            key={heading.id}
                            id={heading.id}
                            data-report-heading
                        />
                    ))}
                    <Textarea
                        aria-label="Section Markdown"
                        autosize
                        minRows={4}
                        value={markdown}
                        disabled={disabled}
                        onChange={(event) =>
                            onChange(event.currentTarget.value)
                        }
                    />
                </Box>
            )}
        </Stack>
    );
};

export default DocumentMarkdownEditor;
