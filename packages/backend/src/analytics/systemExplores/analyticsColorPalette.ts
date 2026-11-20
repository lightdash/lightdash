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
// A provider's largest model takes its colour; its next models take these lighter tints in turn.
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
