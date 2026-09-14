import remarkParse from 'remark-parse';
import { unified } from 'unified';

export const getAiAgentMemoryPreview = (value: string) => value.slice(0, 256);

export type AiAgentMemorySections = {
    memory: string;
    evidence: string | null;
    apply: string | null;
};

const SECTION_NAMES = ['memory', 'evidence', 'apply'] as const;
type SectionName = (typeof SECTION_NAMES)[number];

const markdownParser = unified().use(remarkParse);

const getSectionName = (heading: string): SectionName | null => {
    const name = heading
        .replace(/^ {0,3}#{1,6}[ \t]+/, '')
        .replace(/[ \t]+#+[ \t]*$/, '')
        .trim()
        .toLowerCase();

    return SECTION_NAMES.find((section) => section === name) ?? null;
};

export const parseAiAgentMemorySections = (
    value: string,
): AiAgentMemorySections => {
    const fallback = {
        memory: value.trim(),
        evidence: null,
        apply: null,
    };
    const sections: Record<SectionName, string[]> = {
        memory: [],
        evidence: [],
        apply: [],
    };
    const headings = markdownParser.parse(value).children.flatMap((node) => {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (node.type !== 'heading' || start === undefined || end === undefined)
            return [];

        const section = getSectionName(value.slice(start, end));
        return section ? [{ section, start, end }] : [];
    });

    if (!headings.some(({ section }) => section === 'memory')) return fallback;

    headings.forEach(({ section, end }, index) => {
        const nextStart = headings[index + 1]?.start ?? value.length;
        sections[section].push(value.slice(end, nextStart).trim());
    });

    const preamble = value.slice(0, headings[0].start).trim();
    const memory = [preamble, ...sections.memory]
        .filter(Boolean)
        .join('\n')
        .trim();
    if (!memory) return fallback;

    const evidence = sections.evidence.join('\n').trim();
    const apply = sections.apply.join('\n').trim();

    return {
        memory,
        evidence: evidence || null,
        apply: apply || null,
    };
};
