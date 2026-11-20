/**
 * The message a Design Mode bubble sends to the agent: what it is about, the
 * marks and speech, then the typed words. Without images only the mark and
 * speech lines are kept, since every other summary line refers to an image.
 */
export const buildDesignPrompt = ({
    surfaceHeading,
    summary,
    typed,
    hasImages,
}: {
    surfaceHeading: string;
    /** From buildSummary; empty when nothing was marked or said. */
    summary: string;
    typed: string;
    hasImages: boolean;
}): string => {
    const marks = hasImages
        ? summary
        : summary
              .split('\n')
              .filter((line) => line.startsWith('- '))
              .join('\n');
    return [surfaceHeading, marks, typed.trim()]
        .filter((part) => part !== '')
        .join('\n\n');
};
