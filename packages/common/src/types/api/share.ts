import { type ShareUrl } from '../share';

export type ApiShareResponse = {
    status: 'ok';
    results: ShareUrl;
};
