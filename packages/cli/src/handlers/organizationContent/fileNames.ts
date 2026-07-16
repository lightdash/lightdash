import { allocateContentFileNames } from '../contentAsCode/fileNames';

export const getOrganizationContentFileNames = ({
    values,
    fallbackPrefix,
}: {
    values: string[];
    fallbackPrefix: string;
}): string[] =>
    allocateContentFileNames({
        items: values.map((value) => ({
            identity: value,
            displayName: value,
        })),
        fallbackPrefix,
    });
