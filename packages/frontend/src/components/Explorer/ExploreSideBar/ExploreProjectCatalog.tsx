import { FC } from 'react';
import { useProjectCatalog } from '../../../hooks/useProjectCatalog';
import {
    ProjectCatalogTreeNode,
    useProjectCatalogTree,
} from '../../../hooks/useProjectCatalogTree';
import CatalogTree from '../../common/SqlRunner/CatalogTree';

type Props = {
    onSelect: (node: ProjectCatalogTreeNode) => void;
};

const ExploreProjectCatalog: FC<Props> = ({ onSelect }) => {
    const { isInitialLoading: isCatalogLoading, data: catalogData } =
        useProjectCatalog();

    const catalogTree = useProjectCatalogTree(catalogData);

    if (isCatalogLoading) {
        // TODO: Add loading state
        return null;
    }

    return <CatalogTree nodes={catalogTree} onSelect={onSelect} />;
};

export default ExploreProjectCatalog;
