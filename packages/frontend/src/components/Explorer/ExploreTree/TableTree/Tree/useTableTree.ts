import { useContextSelector } from 'use-context-selector';
import TreeContext from './TreeContext';
import { type TableTreeContext } from './types';

function useTableTree<Selected>(
    selector: (value: TableTreeContext) => Selected,
) {
    return useContextSelector(TreeContext, (context) => {
        if (context === undefined) {
            throw new Error(
                'useTableTree must be used within a TableTreeProvider',
            );
        }
        return selector(context);
    });
}

export default useTableTree;
