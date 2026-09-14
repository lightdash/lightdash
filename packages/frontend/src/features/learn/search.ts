import Fuse from 'fuse.js';
import { SCOPE_TOURS } from '../scopeTours/generated';
import { type LearnModule } from './catalogue';

const STOP_WORDS = new Set(
    'a an and are as at be can could do does for from how i in is it me my of on or please the to want what where with would'.split(
        ' ',
    ),
);

const normalize = (text: string): string =>
    text
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

const SEARCH_KEYS = [
    { name: 'title', weight: 4 },
    { name: 'stepTitles', weight: 2 },
    { name: 'body', weight: 1 },
    { name: 'scope', weight: 1 },
];

/** Builds once per catalogue; queries use only the bundled walkthrough text. */
export const createLearnSearch = (
    modules: LearnModule[],
): ((query: string) => LearnModule[]) => {
    const index = new Fuse(
        modules.map((module) => {
            const steps = SCOPE_TOURS[module.scope]?.steps ?? [];
            return {
                module,
                title: normalize(module.title),
                scope: normalize(module.scope),
                stepTitles: normalize(
                    steps.map((step) => step.title).join(' '),
                ),
                body: normalize(
                    [module.blurb, ...steps.map((step) => step.body)].join(' '),
                ),
            };
        }),
        {
            keys: SEARCH_KEYS,
            includeScore: true,
            ignoreLocation: true,
            threshold: 0.2,
        },
    );

    return (query) => {
        const words = [...new Set(normalize(query).split(' '))].filter(
            (word) => word !== '' && !STOP_WORDS.has(word),
        );
        if (words.length === 0) return modules;

        return index
            .search({
                $and: words.map((word) => ({
                    $or: SEARCH_KEYS.map(({ name }) => ({ [name]: word })),
                })),
            })
            .sort(
                (a, b) =>
                    Number(b.item.module.available) -
                        Number(a.item.module.available) ||
                    (a.score ?? 1) - (b.score ?? 1),
            )
            .map(({ item }) => item.module);
    };
};
