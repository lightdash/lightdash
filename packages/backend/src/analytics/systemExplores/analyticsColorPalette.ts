import { type CreateColorPalette } from '@lightdash/common';

// Every chart whose series or bars are AI models colours them by provider. The rule is read by the
// customizable cartesian chart's splitColorGroups option: Label=prefix|prefix=#hex, matched on the
// start of the model name, ignoring case. The prefixes cover the names each provider route records:
// plain ("claude-...", "gpt-...", "gemini-..."), Bedrock ("us.anthropic.claude-...") and OpenRouter
// ("anthropic/claude-..."). An Azure deployment has a name its owner chose, so it matches no group.
export const modelProviderColors =
    'Anthropic=claude|anthropic|us.anthropic|eu.anthropic|apac.anthropic|global.anthropic=#6366F1;OpenAI=gpt|o1|o3|o4|openai|text-embedding=#34D399;Google=gemini|google=#FBBF24';

// The same rule for code that cannot use the option: each provider with its name prefixes and colour.
export const modelProviders = modelProviderColors.split(';').map((rule) => {
    const [label, prefixes, color] = rule.split('=');
    return { label, prefixes: prefixes.split('|'), color };
});
// Darker means the more powerful model, on every chart. Each provider's tiers, strongest first, one list
// for each rule above and in the same order. Read by the cartesian chart's splitShadeRank option. A
// word matches whole segments of the model name, so "mini" does not match "gemini", and the longest
// matching word wins, so "flash-lite" ranks as itself and not as "flash".
export const modelTierRanks =
    'opus,sonnet,haiku;astra,pro,sol,terra,luna,mini,nano,embedding;ultra,pro,flash,flash-lite,lite';

const tierLists = modelTierRanks.split(';').map((list) => list.split(','));
// Each provider with its tiers; the longest word is tried first
export const modelTiers = modelProviders.map(({ label }, index) => ({
    label,
    tiers: tierLists[index].map((word, rank) => ({ word, rank })),
    count: tierLists[index].length,
}));
const tierPattern = (word: string) => `(^|[^a-z0-9])${word}($|[^a-z0-9])`;
const longestFirst = <T extends { word: string }>(tiers: T[]) =>
    [...tiers].sort((a, b) => b.word.length - a.word.length);

// The place of a model in its provider's tiers: 0 for the strongest. A name with no tier word, or
// from no known provider, comes after every tier.
export const modelTierRank = (model: string): number => {
    const name = model.toLowerCase();
    const provider = modelProviders.find(({ prefixes }) =>
        prefixes.some((prefix) => name.startsWith(prefix)),
    );
    const tiers = modelTiers.find(({ label }) => label === provider?.label);
    if (!tiers) return 99;
    const match = longestFirst(tiers.tiers).find(({ word }) =>
        new RegExp(tierPattern(word)).test(name),
    );
    return match ? match.rank : tiers.count;
};

// The same rank as SQL over a model name and its provider, for ordering in a query
export const modelTierRankSql = (model: string, provider: string): string =>
    `CASE ${modelTiers
        .map(
            ({ label, tiers, count }) =>
                `WHEN ${provider} = '${label}' THEN CASE ${longestFirst(tiers)
                    .map(
                        ({ word, rank }) =>
                            `WHEN regexp_matches(lower(${model}), '${tierPattern(word)}') THEN ${rank}`,
                    )
                    .join(' ')} ELSE ${count} END`,
        )
        .join(' ')} ELSE 99 END`;

// The same rank as a chart expression over a row with a model name and a provider
export const modelTierRankExpression = (model: string, provider: string) =>
    `${modelTiers
        .map(
            ({ label, tiers, count }) =>
                `${provider} === '${label}' ? (${longestFirst(tiers)
                    .map(
                        ({ word, rank }) =>
                            `test(/${tierPattern(word)}/, lower(${model})) ? ${rank} : `,
                    )
                    .join('')}${count}) : `,
        )
        .join('')}99`;

// A model name without the date stamp some providers add ("claude-haiku-4-5-20251001"). The prefix and
// the tier word stay, so the colour and shade rules read it the same as the recorded name.
export const modelDisplayNameSql = (model: string) =>
    `regexp_replace(${model}, '-[0-9]{8}$', '')`;

// A provider's strongest tier takes its colour; weaker tiers take these lighter tints in turn.
export const modelProviderTints: Record<string, string[]> = {
    Anthropic: ['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF'],
    OpenAI: ['#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5', '#ECFDF5'],
    Google: ['#FBBF24', '#FCD34D', '#FDE68A', '#FEF3C7', '#FFFBEB'],
};
// A model that matches no provider, darkest first
export const unmatchedModelTints = [
    '#ADB5BD',
    '#CED4DA',
    '#DEE2E6',
    '#E9ECEF',
    '#F1F3F5',
];

// Managed palette for the Analytics project. Library charts take their series
// colours from the palette the host resolves, so every analytics dashboard
// shares one theme. Vivid and pastel colours alternate so neighbouring stacked
// series stay distinguishable. The name identifies the palette on each sync.
export const analyticsColorPalette = {
    name: 'Lightdash analytics',
    colors: [
        '#6366F1',
        '#A5B4FC',
        '#22D3EE',
        '#F472B6',
        '#C4B5FD',
        '#34D399',
        '#FBCFE8',
        '#FBBF24',
        '#A5F3FC',
        '#8B5CF6',
        '#6EE7B7',
        '#FB7185',
        '#FDE68A',
        '#38BDF8',
        '#E879F9',
        '#BBF7D0',
        '#818CF8',
        '#F9A8D4',
        '#2DD4BF',
        '#DDD6FE',
    ],
    darkColors: [
        '#818CF8',
        '#C7D2FE',
        '#67E8F9',
        '#F9A8D4',
        '#DDD6FE',
        '#6EE7B7',
        '#FCE7F3',
        '#FCD34D',
        '#CFFAFE',
        '#A78BFA',
        '#A7F3D0',
        '#FDA4AF',
        '#FEF3C7',
        '#7DD3FC',
        '#F0ABFC',
        '#DCFCE7',
        '#A5B4FC',
        '#FBCFE8',
        '#5EEAD4',
        '#EDE9FE',
    ],
} satisfies Required<CreateColorPalette>;
