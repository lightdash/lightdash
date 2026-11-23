import { type SemanticLayerModelChange } from '@lightdash/common';
import { Box, Button, Text, useComputedColorScheme } from '@mantine/core';
import { MultiFileDiff, Virtualizer } from '@pierre/diffs/react';
import { useState, type FC } from 'react';
import { pierreThemeFor } from '../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import classes from './ChangeDiff.module.css';
import { findPeekStart } from './modelCode';

const YAML_KEY = /^(\s*(?:- )?[^\s:]+:)(.*)$/;

const PEEK_LINES = 4;
// A new file longer than this opens folded, the rest a click away.
const FOLD_LINES = 40;

// A hairline marks a changed line, rather than Pierre's 4px bar, and the code starts under its header.
const THIN_BARS_CSS =
    "[data-indicators='bars'] [data-column-number]::before { width: 2px !important; } [data-code] { padding-block: 0 !important; }";

const CONTEXT_LINES = { full: 2, compact: 1, peek: 1, whole: 100_000 };

const PlainYaml: FC<{ content: string; isPeek: boolean }> = ({
    content,
    isPeek,
}) => {
    const lines = content.split('\n');
    const start = isPeek ? findPeekStart(lines) : 0;
    const shown = isPeek ? lines.slice(start, start + PEEK_LINES) : lines;
    return (
        <Box component="pre" className={classes.plainFile}>
            {shown.map((line, index) => {
                const [, key, value] = YAML_KEY.exec(line) ?? [];
                return (
                    <Box key={start + index} className={classes.plainLine}>
                        <Text span inherit className={classes.lineNumber}>
                            {start + index + 1}
                        </Text>
                        <Text span inherit>
                            {key ? (
                                <>
                                    <Text
                                        span
                                        inherit
                                        className={classes.yamlKey}
                                    >
                                        {key}
                                    </Text>
                                    {value}
                                </>
                            ) : (
                                line
                            )}
                        </Text>
                    </Box>
                );
            })}
        </Box>
    );
};

/** A model's YAML diff. `compact` fits the agent panel, where a new file reads as plain YAML; `peek` starts a new model's YAML at its metrics; `whole` keeps every line of the file. */
export const ChangeDiff: FC<{
    modelName: string;
    change: Pick<SemanticLayerModelChange, 'contentBefore' | 'contentAfter'>;
    variant: 'full' | 'compact' | 'peek' | 'whole';
}> = ({ modelName, change, variant }) => {
    const compact = variant === 'compact' || variant === 'peek';
    const colorScheme = useComputedColorScheme('light');
    const [isUnfolded, setIsUnfolded] = useState(false);
    const lineCount =
        change.contentBefore === null && change.contentAfter !== null
            ? change.contentAfter.split('\n').length
            : 0;
    const isFolded =
        variant === 'full' && !isUnfolded && lineCount > FOLD_LINES;
    const name = `${modelName}.yml`;
    const viewport = {
        className:
            variant === 'whole'
                ? `${classes.diffViewport} ${classes.whole}`
                : classes.diffViewport,
        'data-compact': compact || undefined,
        'data-full': variant === 'full' || undefined,
        'data-folded': isFolded || undefined,
    };
    if (
        compact &&
        change.contentBefore === null &&
        change.contentAfter !== null
    ) {
        return (
            <Box {...viewport}>
                <PlainYaml
                    content={change.contentAfter}
                    isPeek={variant === 'peek'}
                />
            </Box>
        );
    }
    // The overview scrolls as one page, so only a diff with its own scroll viewport is virtualized.
    const Viewport = variant === 'full' ? Box : Virtualizer;
    // The file's name colours it as YAML.
    return (
        <>
            <Viewport {...viewport}>
                {/* The diff does not redraw when its contents change under the same file name. */}
                <MultiFileDiff
                    key={`${change.contentBefore}\0${change.contentAfter}`}
                    oldFile={{
                        name,
                        contents: change.contentBefore ?? '',
                    }}
                    newFile={{
                        name,
                        contents: change.contentAfter ?? '',
                    }}
                    options={{
                        diffStyle: 'unified',
                        overflow: compact ? 'scroll' : 'wrap',
                        disableFileHeader: true,
                        hunkSeparators: 'simple',
                        diffIndicators: 'bars',
                        lineDiffType: 'word',
                        parseDiffOptions: { context: CONTEXT_LINES[variant] },
                        ...pierreThemeFor(colorScheme),
                        unsafeCSS: THIN_BARS_CSS,
                    }}
                />
            </Viewport>
            {isFolded ? (
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    className={classes.unfold}
                    onClick={() => setIsUnfolded(true)}
                >
                    Show all {lineCount} lines
                </Button>
            ) : null}
        </>
    );
};
