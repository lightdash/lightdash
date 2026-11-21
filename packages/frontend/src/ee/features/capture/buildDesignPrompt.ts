/**
 * Invisible, and put before the typed words: everything ahead of it in a
 * message is written by Design Mode, everything after it by the user.
 */
export const TYPED_WORDS_MARK = '⁣';

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
    return [surfaceHeading, marks, `${TYPED_WORDS_MARK}${typed.trim()}`]
        .filter((part) => part !== '')
        .join('\n\n');
};

// buildSummary's lines: "- ① (0:01) circled…: "said"" and "- (0:03) "said"".
const MARK_LINE = /^- (?:([①-⑳])|\((\d+)\)) \(\d+:\d\d\) (.*)$/;
const SPEECH_LINE = /^- \(\d+:\d\d\) "(.*)"$/;
const SAID_WITH_MARK = ': "';

/**
 * What the user put into a message built by buildDesignPrompt: the marks they
 * made and the words they said and typed. Null for any other message.
 */
export const readDesignPrompt = (
    message: string,
): { marks: number[]; said: string[]; typed: string } | null => {
    const at = message.indexOf(TYPED_WORDS_MARK);
    if (at === -1) return null;
    const marks: number[] = [];
    const said: string[] = [];
    message
        .slice(0, at)
        .split('\n')
        .forEach((line) => {
            const speech = SPEECH_LINE.exec(line);
            if (speech) {
                said.push(speech[1]);
                return;
            }
            const mark = MARK_LINE.exec(line);
            if (!mark) return;
            marks.push(
                mark[1] ? mark[1].codePointAt(0)! - 0x245f : Number(mark[2]),
            );
            const rest = mark[3];
            const saidAt = rest.lastIndexOf(SAID_WITH_MARK);
            if (saidAt !== -1 && rest.endsWith('"')) {
                said.push(rest.slice(saidAt + SAID_WITH_MARK.length, -1));
            }
        });
    return { marks, said, typed: message.slice(at + 1).trim() };
};
