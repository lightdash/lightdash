import useEmbed from '../../../providers/Embed/useEmbed';

/** True when the embedding host asked the agent to stay on its thread. */
export const useIsAiAgentNavigationDisabled = () =>
    useEmbed().aiAgentNavigationDisabled;
