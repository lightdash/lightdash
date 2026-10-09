import { useLocalStorage } from '@mantine/hooks';

// Browser-level preference: dev & PR schemas fold into one node by default
export const useGroupDevSchemas = () =>
    useLocalStorage<boolean>({
        key: 'sql-runner:group-dev-schemas',
        defaultValue: true,
        getInitialValueInEffect: false,
    });
