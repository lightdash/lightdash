import { Box } from '@mantine/core';
import { type CSSProperties, type FC } from 'react';
import classes from './SqlSkeleton.module.css';

type Token = { width: number; keyword: boolean };
type Line = { indent: number; tokens: Token[] };

const kw = (width: number): Token => ({ width, keyword: true });
const id = (width: number): Token => ({ width, keyword: false });

// The outline of a compiled query: select list, source, grouping, order, limit
const LINES: Line[] = [
    { indent: 0, tokens: [kw(44)] },
    { indent: 1, tokens: [id(148), kw(16), id(112)] },
    { indent: 1, tokens: [id(120), kw(16), id(96)] },
    { indent: 1, tokens: [kw(36), id(132), kw(16), id(140)] },
    { indent: 0, tokens: [kw(32)] },
    { indent: 1, tokens: [id(172), kw(16), id(64)] },
    { indent: 0, tokens: [kw(60)] },
    { indent: 1, tokens: [id(10)] },
    { indent: 0, tokens: [kw(60)] },
    { indent: 1, tokens: [id(128), kw(28)] },
    { indent: 0, tokens: [kw(36)] },
    { indent: 1, tokens: [id(24)] },
];

/** Stands in for the read-only editor while its SQL compiles or it mounts. */
const SqlSkeleton: FC = () => (
    <Box className={classes.root} aria-hidden>
        {LINES.map((line, index) => (
            <Box
                key={index}
                className={classes.line}
                style={{ '--line-index': index } as CSSProperties}
            >
                <Box className={classes.lineNumber}>{index + 1}</Box>
                <Box className={classes.code} data-indent={line.indent}>
                    {line.tokens.map((token, tokenIndex) => (
                        <Box
                            key={tokenIndex}
                            className={classes.token}
                            data-keyword={token.keyword || undefined}
                            style={
                                {
                                    '--token-width': `${token.width}px`,
                                } as CSSProperties
                            }
                        />
                    ))}
                </Box>
            </Box>
        ))}
    </Box>
);

export default SqlSkeleton;
