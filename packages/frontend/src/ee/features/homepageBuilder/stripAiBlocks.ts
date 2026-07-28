import { type HomepageBlock, type HomepageConfig } from '@lightdash/common';

// With no agent configured the Ask AI surfaces have nothing to talk to, so they
// are dropped from the config before the layout is resolved — otherwise the
// resolver hoists a block that renders nothing into the hero slot, leaving a
// blank first screen. A hero that still greets is kept: the greeting alone is a
// valid page header (see AskAiHeroBlockView).
const stripBlock = (block: HomepageBlock): HomepageBlock | null => {
    switch (block.type) {
        case 'ask-ai-hero':
            return block.config.showGreeting ? block : null;
        case 'quick-actions': {
            const actions = block.config.actions.filter(
                (action) => action.type !== 'ask-ai',
            );
            return actions.length > 0
                ? { ...block, config: { ...block.config, actions } }
                : null;
        }
        default:
            return block;
    }
};

export const stripUnavailableAiBlocks = (
    config: HomepageConfig,
): HomepageConfig => ({
    ...config,
    rows: config.rows
        .map((row) => ({
            ...row,
            blocks: row.blocks
                .map(stripBlock)
                .filter((block): block is HomepageBlock => block !== null),
        }))
        .filter((row) => row.blocks.length > 0),
});
