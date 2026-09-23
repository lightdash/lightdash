import { usePrototypeVariant } from '../../../../../components/common/usePrototypeVariant';

// PROTOTYPE ONLY. Where does the composer pipeline live in the artifact?

export const COMPOSER_PROTOTYPE_VARIANTS = [
    { key: 'today', name: 'Pipeline in the tool-call row (current)' },
    { key: 'A', name: 'Collapsible footer under the table' },
    { key: 'B', name: 'Results / Pipeline tabs in the header' },
    { key: 'C', name: 'Node strip above the table, click for SQL' },
] as const;

export type ComposerPrototypeVariantKey =
    (typeof COMPOSER_PROTOTYPE_VARIANTS)[number]['key'];

export const useComposerPrototypeVariant = () =>
    usePrototypeVariant(COMPOSER_PROTOTYPE_VARIANTS);
