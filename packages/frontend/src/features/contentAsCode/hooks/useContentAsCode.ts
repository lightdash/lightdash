import { type ApiError } from '@lightdash/common';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import * as yaml from 'js-yaml';
import omit from 'lodash/omit';
import { useMemo } from 'react';

const NO_FIELDS_TO_OMIT: string[] = [];

type UseContentAsCodeArgs<Results> = {
    queryKey: QueryKey;
    queryFn: () => Promise<Results>;
    selectDocument: (results: Results) => object | undefined;
    enabled: boolean;
    fieldsToOmit?: string[];
};

export const useContentAsCode = <Results>({
    queryKey,
    queryFn,
    selectDocument,
    enabled,
    fieldsToOmit = NO_FIELDS_TO_OMIT,
}: UseContentAsCodeArgs<Results>) => {
    const query = useQuery<Results, ApiError>({
        queryKey,
        queryFn,
        enabled,
    });

    const contentYaml = useMemo(() => {
        if (!query.data) return undefined;

        const document = selectDocument(query.data);
        if (!document) return undefined;

        return yaml.dump(omit(document, fieldsToOmit), {
            quotingType: '"',
            sortKeys: true,
        });
    }, [fieldsToOmit, query.data, selectDocument]);

    return { ...query, contentYaml };
};
