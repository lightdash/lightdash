import { FC } from 'react';
import { useProjectCatalog } from '../../../hooks/useProjectCatalog';
import {
    ProjectCatalogTreeNode,
    useProjectCatalogTree,
} from '../../../hooks/useProjectCatalogTree';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
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

    return (
        <>
            <PageBreadcrumbs
                size="md"
                items={[{ title: 'Untitled explore', active: true }]}
            />

            <div style={{ overflowY: 'auto', flex: 1 }}>
                <CatalogTree nodes={catalogTree} onSelect={onSelect} />
            </div>
        </>
    );
};

export default ExploreProjectCatalog;
