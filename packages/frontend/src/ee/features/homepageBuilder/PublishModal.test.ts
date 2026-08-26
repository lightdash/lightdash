import { RESOLUTION_STEPS } from './PublishModal';

it('labels the last resolution tier as the project default', () => {
    expect(RESOLUTION_STEPS).toEqual([
        'Group priority',
        'Role',
        'Project default',
    ]);
});
