/**
 * The message an Inline recording sends to the agent: a heading naming what
 * it is about, what the page has already done (if anything), then the
 * recording's summary exactly as transcribed. Without screenshots only the
 * mark and speech lines are kept, since every other line refers to images.
 */
export const buildAgentPrompt = ({
    heading,
    alreadyDone,
    summary,
    hasImages,
}: {
    heading: string;
    alreadyDone?: string;
    summary: string;
    hasImages: boolean;
}): string => {
    const body = hasImages
        ? summary
        : summary
              .split('\n')
              .filter((line) => line.startsWith('- '))
              .join('\n');
    const done = alreadyDone
        ? `The page has already made these layout changes as an unsaved preview, so do not change the layout for them: ${alreadyDone}.\n\n`
        : '';
    return `${heading}\n\n${done}${body}`;
};
