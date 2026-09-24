import { Center, Loader } from '@mantine/core';
import { useContext, type FC } from 'react';
import { MultiConnectionSqlEditor } from '../multiConnection/components/MultiConnectionSqlEditor';
import { ActiveConnectionContext } from '../multiConnection/hooks/activeConnectionContext';
import { useAppSelector } from '../store/hooks';
import { selectConnectionRoute } from '../store/sqlRunnerSlice';
import { SqlEditor, type SqlEditorProps } from './SqlEditor';

export const SqlRunnerEditor: FC<SqlEditorProps> = (props) => {
    const activeConnection = useContext(ActiveConnectionContext);
    const { route } = useAppSelector(selectConnectionRoute);
    if (activeConnection) return <MultiConnectionSqlEditor {...props} />;
    if (route === 'single') return <SqlEditor {...props} />;
    return (
        <Center h="100%">
            <Loader color="gray" size="xs" />
        </Center>
    );
};
