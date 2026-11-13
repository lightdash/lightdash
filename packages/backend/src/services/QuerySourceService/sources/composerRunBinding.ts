import type { ComposerRunBinding } from '../../ComposerChartService/ComposerRunBinding';
import type { SubmitSourceQueryArgs } from '../types';

export const getComposerRunBinding = (
    binding: SubmitSourceQueryArgs['binding'],
): { composerRunBinding?: ComposerRunBinding } =>
    binding?.kind === 'composer' ? { composerRunBinding: binding.binding } : {};
