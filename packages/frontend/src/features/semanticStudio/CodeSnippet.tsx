import { Box, useComputedColorScheme } from '@mantine/core';
import { File, WorkerPoolContextProvider } from '@pierre/diffs/react';
import { type FC } from 'react';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
    pierreThemeFor,
} from '../writeback/pierreDiffConfig';
import classes from './CodeSnippet.module.css';

/** A few lines of code to read, drawn by the same viewer and theme as the editor. */
export const CodeSnippet: FC<{ code: string; language: 'sql' | 'yaml' }> = ({
    code,
    language,
}) => {
    const colorScheme = useComputedColorScheme('light');
    return (
        <Box className={classes.snippet}>
            <WorkerPoolContextProvider
                poolOptions={PIERRE_POOL_OPTIONS}
                highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
            >
                <File
                    file={{ name: `snippet.${language}`, contents: code }}
                    options={{
                        ...pierreThemeFor(colorScheme),
                        overflow: 'wrap',
                        disableFileHeader: true,
                        disableLineNumbers: true,
                    }}
                />
            </WorkerPoolContextProvider>
        </Box>
    );
};
