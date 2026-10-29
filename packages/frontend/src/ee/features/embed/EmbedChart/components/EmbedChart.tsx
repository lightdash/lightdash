import { Box } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import LoadingChart from '../../../../../components/common/LoadingChart';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import MinimalSavedExplorer from '../../../../../pages/MinimalSavedExplorer';
import classes from './EmbedChart.module.css';

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

    if (!isInitialLoading && !data) {
        return (
            <Box mt={20}>
                <SuboptimalState title="Chart not found" icon={IconUnlink} />
            </Box>
        );
    }

    return (
        <div
            className={containerStyles ? undefined : classes.scrollContainer}
            // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
            style={containerStyles}
        >
            {isInitialLoading ? (
                <LoadingChart />
            ) : (
                <MinimalSavedExplorer savedQueryUuid={savedQueryUuid} />
            )}
        </div>
    );
};

export default EmbedChart;
