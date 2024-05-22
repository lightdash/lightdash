import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import { CatalogPanel } from '../features/catalog/components';

const Catalog: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;

    return (
        <Page withFixedContent withPaddedContent withFooter>
            <Stack>
                <CatalogPanel projectUuid={selectedProjectUuid} />
            </Stack>
        </Page>
    );
};

export default Catalog;
