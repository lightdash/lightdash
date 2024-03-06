import { Center, Loader } from '@mantine/core';
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

    return isCatalogLoading ? (
        // TODO: replace with proper loader
        <Center style={{ flex: 1 }}>
            <Loader size={28} />
        </Center>
    ) : (
        <div style={{ overflowY: 'auto', flex: 1 }}>
            <CatalogTree nodes={catalogTree} onSelect={onSelect} />
        </div>
    );
};

export default ExploreProjectCatalog;
