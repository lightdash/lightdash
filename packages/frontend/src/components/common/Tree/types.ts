export type NestableItem = {
    uuid: string;
    name: string;
    path: string;
    parentSpaceUuid: string | null;
    restricted?: boolean;
};
