import type { ComposerRunBinding } from '../../ComposerChartService/ComposerRunBinding';
import type { SubmitSourceQueryArgs } from '../types';

/** The composer binding a source forwards to its execution path, if the run is bound to one. */
export const getComposerRunBinding = (
    binding: SubmitSourceQueryArgs['binding'],
): { composerRunBinding?: ComposerRunBinding } =>
    binding?.kind === 'composer' ? { composerRunBinding: binding.binding } : {};
