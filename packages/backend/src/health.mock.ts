export const Image = {
    creator: 12969647,
    id: 150371595,
    image_id: null,
    images: [
        {
            architecture: 'amd64',
            features: '',
            variant: null,
            digest: 'sha256:f57bff7a67e3ad5257dba1f284f9c8e68f904acbc33e1747e708db53143b3dd8',
            os: 'linux',
            os_features: '',
            os_version: null,
            size: 818603887,
            status: 'active',
            last_pulled: '2021-06-29T12:33:06.404247Z',
            last_pushed: '2021-06-28T11:29:48.15486Z',
        },
    ],
    last_updated: '2021-06-28T11:29:48.15486Z',
    last_updater: 12969647,
    last_updater_username: 'lightdash',
    name: '0.2.7',
    repository: 13682861,
    full_size: 818603887,
    v2: true,
    tag_status: 'active',
    tag_last_pulled: '2020-06-29T12:33:06.404247Z',
    tag_last_pushed: '2020-06-28T11:29:48.15486Z',
};

export const LatestImage = {
    ...Image,
    name: 'latest',
    tag_last_pulled: '2021-06-29T12:33:06.404247Z',
};

export const OldImage = {
    ...Image,
    name: '0.1.0',
    last_updated: '2019-06-28T11:29:48.15486Z',
};

export const DevImage = {
    ...Image,
    name: '0.2.7-dev',
};

export const ImagesResponse = {
    count: 14,
    next: 'https://hub.docker.com/v2/repositories/lightdash/lightdash/tags?page=2',
    previous: null,
    results: [DevImage, OldImage, LatestImage, Image],
};
