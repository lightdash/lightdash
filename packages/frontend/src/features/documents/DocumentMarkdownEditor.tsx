import {
    Box,
    Group,
    SegmentedControl,
    Stack,
    Textarea,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import { IconMarkdown, IconTypography } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { TiptapMarkdownEditor } from '../../ee/features/homepageBuilder/blocks/markdownEditor/TiptapMarkdownEditor';
import { supportsRichTextEditing } from './documentMarkdown';
import { type ReportHeading } from './presentation/DocumentReportLayout';

const DocumentMarkdownEditor = ({
    markdown,
    onChange,
    disabled,
    headings,
    renderHeader = (modeSwitch) => (
        <Group justify="flex-end">{modeSwitch}</Group>
    ),
}: {
    markdown: string;
    onChange: (markdown: string) => void;
    disabled: boolean;
    headings: ReportHeading[];
    renderHeader?: (modeSwitch: ReactNode) => ReactNode;
}) => {
    const richTextSupported = supportsRichTextEditing(markdown);
    const [mode, setMode] = useState(() =>
        richTextSupported ? 'text' : 'markdown',
    );
    const showRichText = mode === 'text' && richTextSupported;
    return (
        <Stack gap="xs">
            {renderHeader(
                <SegmentedControl
                    size="xs"
                    value={showRichText ? 'text' : 'markdown'}
                    disabled={disabled}
                    onChange={setMode}
                    data={[
                        {
                            label: (
                                <Tooltip
                                    label={
                                        richTextSupported
                                            ? 'Text'
                                            : 'Edit as Markdown to preserve this section’s formatting'
                                    }
                                    openDelay={200}
                                >
                                    <Box
                                        component="span"
                                        lh={0}
                                        display="inline-block"
                                    >
                                        <MantineIcon
                                            icon={IconTypography}
                                            size="sm"
                                        />
                                        <VisuallyHidden>Text</VisuallyHidden>
                                    </Box>
                                </Tooltip>
                            ),
                            value: 'text',
                            disabled: !richTextSupported,
                        },
                        {
                            label: (
                                <Tooltip label="Markdown" openDelay={200}>
                                    <Box
                                        component="span"
                                        lh={0}
                                        display="inline-block"
                                    >
                                        <MantineIcon
                                            icon={IconMarkdown}
                                            size="sm"
                                        />
                                        <VisuallyHidden>
                                            Markdown
                                        </VisuallyHidden>
                                    </Box>
                                </Tooltip>
                            ),
                            value: 'markdown',
                        },
                    ]}
                />,
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
