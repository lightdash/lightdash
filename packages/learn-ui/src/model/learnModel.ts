import { type ScopeSource } from '../scope/types';
import { createAskModel, type AskModel } from './ask';
import { createAskViewModel, type AskViewModel } from './askView';
import { createBoardModel, type BoardModel } from './model';
import { createVisibilityModel, type VisibilityModel } from './visibility';

export type LearnModel = BoardModel & AskModel & AskViewModel & VisibilityModel;

/** Everything that reads the scope registry, bound to one ScopeSource. */
export const createLearnModel = (source: ScopeSource): LearnModel => {
    const board = createBoardModel(source);
    const ask = createAskModel(board);
    return {
        ...board,
        ...ask,
        ...createAskViewModel(board, ask),
        ...createVisibilityModel(board),
    };
};
