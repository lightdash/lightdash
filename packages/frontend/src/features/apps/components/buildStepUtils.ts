import {
    IconFileCode,
    IconFilePlus,
    IconFileText,
    IconPencil,
    IconPlayerPlay,
    IconPoint,
    IconSearch,
    IconTrash,
    type Icon,
} from '@tabler/icons-react';

const VERB_ICONS: [RegExp, Icon][] = [
    [/^creat/i, IconFilePlus],
    [/^(edit|updat|modif|writ)/i, IconPencil],
    [/^(read|open|view|inspect)/i, IconFileText],
    [/^(search|find|look|list|grep)/i, IconSearch],
    [/^(run|build|test|install|bundl|compil|check)/i, IconPlayerPlay],
    [/^(delet|remov)/i, IconTrash],
    [/\.(tsx?|jsx?|css|json|ya?ml|md)\b/i, IconFileCode],
];

export const getBuildStepIcon = (text: string): Icon =>
    VERB_ICONS.find(([re]) => re.test(text.trim()))?.[1] ?? IconPoint;

export const formatElapsed = (ms: number): string => {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
};
