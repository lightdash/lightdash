import {
    CodeHighlight,
    type CodeHighlightProps,
} from '@mantine-8/code-highlight';
import { Box, CopyButton, Tooltip } from '@mantine-8/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { type CSSProperties, type FC } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './CodeBlock.module.css';

type Props = Omit<
    CodeHighlightProps,
    'code' | 'controls' | 'withCopyButton'
> & {
    code: string;
    lineNumberFontSize?: CSSProperties['fontSize'];
    onCopy?: () => void;
    withCopyButton?: boolean;
    withLineNumbers?: boolean;
};

const CodeBlockCopyControl: FC<{
    code: string;
    copiedLabel: string;
    copyLabel: string;
    onCopy?: () => void;
}> = ({ code, copiedLabel, copyLabel, onCopy }) => (
    <CopyButton value={code}>
        {({ copied, copy }) => {
            const label = copied ? copiedLabel : copyLabel;

            return (
                <Tooltip label={label}>
                    <CodeHighlight.Control
                        aria-label={label}
                        onClick={() => {
                            copy();
                            onCopy?.();
                        }}
                    >
                        <MantineIcon icon={copied ? IconCheck : IconCopy} />
                    </CodeHighlight.Control>
                </Tooltip>
            );
        }}
    </CopyButton>
);

const CodeBlock: FC<Props> = ({
    code,
    copiedLabel = 'Copied',
    copyLabel = 'Copy',
    lineNumberFontSize,
    onCopy,
    withCopyButton = true,
    withLineNumbers = false,
    ...props
}) => {
    const trimmedCode = code.trim();
    const lineCount = trimmedCode.split('\n').length;
    const lineNumbers = Array.from(
        { length: lineCount },
        (_, index) => index + 1,
    ).join('\n');

    return (
        <Box
            className={classes.wrapper}
            data-with-line-numbers={withLineNumbers || undefined}
            style={
                {
                    '--code-block-line-numbers-width': `${String(lineCount).length}ch`,
                } as CSSProperties
            }
        >
            {withLineNumbers && (
                <code
                    aria-hidden
                    className={classes.lineNumbers}
                    style={{ fontSize: lineNumberFontSize }}
                >
                    {lineNumbers}
                </code>
            )}

            <CodeHighlight
                {...props}
                code={trimmedCode}
                copiedLabel={copiedLabel}
                copyLabel={copyLabel}
                controls={
                    withCopyButton
                        ? [
                              <CodeBlockCopyControl
                                  key="copy"
                                  code={trimmedCode}
                                  copiedLabel={copiedLabel}
                                  copyLabel={copyLabel}
                                  onCopy={onCopy}
                              />,
                          ]
                        : undefined
                }
                withCopyButton={false}
            />
        </Box>
    );
};

export default CodeBlock;
