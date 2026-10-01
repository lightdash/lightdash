import { Box } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import MinimalSavedExplorer from '../../../../../pages/MinimalSavedExplorer';

type Props = {
    containerStyles?: React.CSSProperties;
    savedQueryUuid: string;
};

const EmbedChart: FC<Props> = ({ containerStyles, savedQueryUuid }) => {
    const projectUuid = useProjectUuid();
    const { data, isInitialLoading, isError, error } = useSavedQuery({
        uuidOrSlug: savedQueryUuid,
        projectUuid,
    });

    if (isInitialLoading) {
        return null;
    }

    if (isError) {
        return (
            <Box mt={20}>
                <SuboptimalState
                    title="Error loading chart"
                    icon={IconUnlink}
                    description={
                        error.error.message.includes('jwt expired')
                            ? 'This embed link has expired'
                            : error.error.message
                    }
                />
            </Box>
        );
    }

    if (!data) {
        return (
            <Box mt={20}>
                <SuboptimalState title="Chart not found" icon={IconUnlink} />
            </Box>
        );
    }

    return (
        <div
            style={
                containerStyles ?? {
                    height: '100vh',
                    overflowY: 'auto',
                    margin: '16px',
                }
            }
        >
            <MinimalSavedExplorer savedQueryUuid={savedQueryUuid} />
        </div>
    );
};

export default EmbedChart;
