import { Group } from '@mantine-8/core';
import { IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import classes from './CompilationHistoryTopToolbar.module.css';
import CompilationSourceFilter from './SourceFilter';
import { type CompilationSource } from './types';

type CompilationHistoryTopToolbarProps = {
    selectedSource: CompilationSource | null;
    setSelectedSource: (source: CompilationSource | null) => void;
};

export const CompilationHistoryTopToolbar: FC<
    CompilationHistoryTopToolbarProps
> = ({ selectedSource, setSelectedSource }) => {
    return (
        <Group
            justify="space-between"
            px="sm"
            py="md"
            wrap="nowrap"
            className={classes.toolbar}
        >
            <Group gap="xs" wrap="nowrap">
                <MantineIcon icon={IconFilter} color="ldGray" />
                <CompilationSourceFilter
                    selectedSource={selectedSource}
                    setSelectedSource={setSelectedSource}
                />
            </Group>
        </Group>
    );
};
