  import { useQuery } from '@tanstack/react-query';
  import { lightdashApi } from '../api';
  import useUser from './user/useUser';
  import { Connection} from '@lightdash/common';


  const getConnections = async (): Promise<Connection[]> => {
    const data = await lightdashApi<Connection[]>({
        url: `/connections`,
        method: 'GET',
        body: undefined,
    });

    console.log('[DEBUG] Connections:', data); // Debug log
    return data;
};

  export const useConnections = () => {
      const { data: user } = useUser(true);

      return useQuery<Connection[], Error>({
          queryKey: ['connections', user?.userUuid],
          queryFn: getConnections,
          enabled: !!user?.userUuid,
          retry: false,
      });
  };

  export default useConnections;