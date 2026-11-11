import { Box, useComputedColorScheme } from '@mantine/core';
import { PatchDiff } from '@pierre/diffs/react';
import { type FC } from 'react';
import { type CustomRendererProps } from 'streamdown';
import { AiMarkdownErrorBoundary } from '../../../../../components/common/AiMarkdown/AiMarkdownErrorBoundary';
import classes from './DiffMarkdownCodeBlock.module.css';

const PlainDiff: FC<{ code: string }> = ({ code }) => (
    <Box component="pre" className={classes.plain}>
        {code}
    </Box>
);

/** A ```diff block in a reply, drawn as a real diff; a patch that is still streaming or does not parse reads as plain text. */
export const DiffMarkdownCodeBlock: FC<CustomRendererProps> = ({
    code,
    isIncomplete,
}) => {
    const colorScheme = useComputedColorScheme('light');
    // With git's a/ and b/ prefixes the header reads as a rename of the file onto itself.
    const patch = code
        .replace(/^--- a\//m, '--- ')
        .replace(/^\+\+\+ b\//m, '+++ ');
    return (
        <Box className={classes.block}>
            {isIncomplete ? (
                <PlainDiff code={code} />
            ) : (
                <AiMarkdownErrorBoundary fallback={<PlainDiff code={code} />}>
                    <PatchDiff
                        // The diff does not redraw when its patch changes.
                        key={patch}
                        patch={patch}
                        className={classes.host}
                        disableWorkerPool
                        options={{
                            diffStyle: 'unified',
                            overflow: 'scroll',
                            hunkSeparators: 'simple',
                            diffIndicators: 'bars',
                            lineDiffType: 'word',
                            theme:
                                colorScheme === 'dark'
                                    ? 'pierre-dark'
                                    : 'pierre-light',
                        }}
                    />
                </AiMarkdownErrorBoundary>
            )}
        </Box>
    );
};
