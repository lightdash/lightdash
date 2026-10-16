import { Anchor } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import ChartTypeLibrarySection from './ChartTypeLibrarySection';

type Props = {
    projectUuid: string;
    onClose: () => void;
    /** Called after a successful install with the installed app's uuid. */
    onInstalled?: (appUuid: string) => void;
};

/**
 * The chart type library in place: browse and install without leaving the
 * Explorer, so the picked fields and picker state survive the detour. The
 * gallery page stays linked for the full-width view.
 */
const ChartTypeLibraryModal: FC<Props> = ({
    projectUuid,
    onClose,
    onInstalled,
}) => {
    const { t } = useTranslation('chartTypes');
    return (
        <MantineModal
            opened
            onClose={onClose}
            title={t('libraryModal.title')}
            icon={IconPuzzle}
            // The library cards carry live previews sized for the gallery page;
            // xl squeezes their three columns into truncation.
            size={1100}
            subtitle={
                <Anchor
                    component={Link}
                    to={`/projects/${projectUuid}/chart-studio?tab=chart-library`}
                    fz="xs"
                >
                    {t('libraryModal.openChartStudio')}
                </Anchor>
            }
            bodyScrollAreaMaxHeight="calc(100vh - 200px)"
        >
            <ChartTypeLibrarySection
                projectUuid={projectUuid}
                withHeader={false}
                onInstalled={onInstalled}
            />
        </MantineModal>
    );
};

export default ChartTypeLibraryModal;
