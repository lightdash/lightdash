import { useContextSelector } from 'use-context-selector';
import ExplorerContext from './context';
import { type ExplorerContextType } from './types';

function useExplorerContext<Selected>(
    selector: (value: ExplorerContextType) => Selected,
) {
    return useContextSelector(ExplorerContext, (context) => {
        if (context === undefined) {
            throw new Error(
                'useExplorer must be used within a ExplorerProvider',
            );
        }
        return selector(context);
    });
}

export default useExplorerContext;
