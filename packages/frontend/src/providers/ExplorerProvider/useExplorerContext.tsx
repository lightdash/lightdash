import { useContextSelector } from 'use-context-selector';
import { Context } from '.';
import { ExplorerContext } from './types';

export function useExplorerContext<Selected>(
    selector: (value: ExplorerContext) => Selected,
) {
    return useContextSelector(Context, (context) => {
        if (context === undefined) {
            throw new Error(
                'useExplorer must be used within a ExplorerProvider',
            );
        }
        return selector(context);
    });
}
