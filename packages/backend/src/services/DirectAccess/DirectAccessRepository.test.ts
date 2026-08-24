import { type Knex } from 'knex';
import { describe, expect, it } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AppAccessModel } from '../../models/AppAccessModel';
import { DashboardAccessModel } from '../../models/DashboardAccessModel';
import { ModelRepository } from '../../models/ModelRepository';
import { SavedChartAccessModel } from '../../models/SavedChartAccessModel';
import { SavedSqlAccessModel } from '../../models/SavedSqlAccessModel';
import { type UtilRepository } from '../../utils/UtilRepository';

describe('direct access repository wiring', () => {
    it('exposes every concrete model without composing an untrusted service', () => {
        const models = new ModelRepository({
            database: {} as Knex,
            lightdashConfig: lightdashConfigMock,
            utils: {} as UtilRepository,
        });
        expect(models.getAppAccessModel()).toBeInstanceOf(AppAccessModel);
        expect(models.getDashboardAccessModel()).toBeInstanceOf(
            DashboardAccessModel,
        );
        expect(models.getSavedChartAccessModel()).toBeInstanceOf(
            SavedChartAccessModel,
        );
        expect(models.getSavedSqlAccessModel()).toBeInstanceOf(
            SavedSqlAccessModel,
        );
    });
});
