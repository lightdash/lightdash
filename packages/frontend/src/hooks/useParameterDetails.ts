import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';

export const getParameterDetails = async ({
    projectUuid,
    parameterReferences,
}: {
    projectUuid: string;
    parameterReferences: string[];
}) => {
    // Dummy implementation for development. Replace with real fetch logic.
    // const response = await fetch(`/api/v2/projects/${projectUuid}/parameters`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ parameterReferences }),
    // });
    // if (!response.ok) throw new Error('Failed to fetch parameter details');
    // return response.json();
    console.log(projectUuid);
    return parameterReferences.map((paramId) => ({
        paramId,
        options: ['option1', 'option2', 'option3'],
    }));
};

export const useParameterDetails = ({
    parameterReferences,
}: {
    parameterReferences: string[];
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return useQuery(
        ['parameterDetails', projectUuid, parameterReferences],
        () =>
            getParameterDetails({
                projectUuid: projectUuid!,
                parameterReferences,
            }),
        {
            enabled: !!projectUuid && parameterReferences.length > 0,
        },
    );
};
