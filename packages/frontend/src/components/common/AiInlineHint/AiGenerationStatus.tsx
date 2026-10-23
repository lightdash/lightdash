import { Group, Loader, Text } from '@mantine/core';
import { type FC } from 'react';
import classes from './AiInlineHint.module.css';

type Props = {
    error: string | null;
    /** Prompt currently being generated from, or null when idle. */
    generatingPrompt: string | null;
    /** Prompt the current content was generated from, or null. */
    provenancePrompt: string | null;
};

export const AiGenerationStatus: FC<Props> = ({
    error,
    generatingPrompt,
    provenancePrompt,
}) => (
    <>
        {error && <Text className={classes.errorText}>{error}</Text>}
        {generatingPrompt && (
            <Group gap={6} wrap="nowrap" className={classes.generating}>
                <Loader size="xs" color="indigo.4" />
                <Text span inherit>
                    Generating from &ldquo;{generatingPrompt}&rdquo;…
                </Text>
            </Group>
        )}
        {provenancePrompt && (
            <Text className={classes.provenance}>
                Generated from &ldquo;{provenancePrompt}&rdquo;
            </Text>
        )}
    </>
);
