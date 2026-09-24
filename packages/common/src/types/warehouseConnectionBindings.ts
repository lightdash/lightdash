export type ApiBindDbtSourceToWarehouseConnectionRequest = {
    warehouseConnectionUuid: string | null;
};

export type DbtSourceBindingConnection = {
    warehouseConnectionUuid: string;
    name: string;
    isOriginal: boolean;
};

export type DbtSourceBinding = {
    projectDbtSourceUuid: string;
    warehouseConnectionUuid: string | null;
};

export type DbtSourceBindings = {
    connections: DbtSourceBindingConnection[];
    sources: DbtSourceBinding[];
};

export type ApiDbtSourceBindingsResponse = {
    status: 'ok';
    results: DbtSourceBindings;
};
