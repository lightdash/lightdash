import type { ComposerRunBinding } from '../../ComposerChartService/ComposerRunBinding';
import type { SourceQueryRunBinding } from '../types';

export const getComposerRunBinding = (
    binding: SourceQueryRunBinding | null,
): { composerRunBinding?: ComposerRunBinding } =>
    binding?.kind === 'composer' ? { composerRunBinding: binding.binding } : {};
