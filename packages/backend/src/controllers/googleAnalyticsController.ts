// packages/backend/src/controllers/GoogleAnalyticsController.ts
import express from 'express';
import {
  Controller,
  Get,
  Post,
  Route,
  Tags,
  Query,
  Request,
  Body,
  Response as TsoaResponse,
} from '@tsoa/runtime';
import { google } from 'googleapis';
import { ApiSuccessEmpty, ConnectionType } from '@lightdash/common'; // ensure enum has GOOGLE_ANALYTICS
import { ParameterError, ForbiddenError } from '@lightdash/common';
import { runDataIngestion } from '../services/ShopifyDataIngestion';
import { LightdashRequestMethodHeader, ApiErrorPayload } from '@lightdash/common';

const oauth2Client = new google.auth.OAuth2(
  process.env.GA_CLIENT_ID,
  process.env.GA_CLIENT_SECRET,
);

type SelectBody = {
  connectionUuid: string;
  account: string;  // "accounts/123"
  property: string; // "properties/151581146"
};

@Route('/api/v1/google-analytics')
@Tags('GoogleAnalytics')
export class GoogleAnalyticsController extends Controller {
  /**
   * OAuth2 callback from Google. Writes tokens to DB, marks connection inactive (pending selection),
   * redirects to the UI which will open the GA selection modal.
   */
  //   @Get('/oauth/callback')
  //   public async oauthCallback(
  //     @Request() req: express.Request,
  //     @Res() redirect: TsoaResponse<302, undefined, { Location: string }>
  //   ): Promise<void> {
  //     const { code } = req.query;
  //     if (!code) throw new ParameterError('Missing code');

  //     const { tokens } = await oauth2Client.getToken(String(code));
  //     if (!tokens.access_token) throw new ForbiddenError('OAuth token exchange failed.');
  //     oauth2Client.setCredentials(tokens);

  //     // Upsert a GA connection row; no property yet
  //     const connection = await req.services.getConnectionsService().createOrUpdate({
  //       user_uuid: req.user?.userUuid ?? null,
  //       type: ConnectionType.GOOGLE_ANALYTICS,
  //       access_token: tokens.access_token!,
  //       refresh_token: tokens.refresh_token ?? null,
  //       expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  //       property_id: null,
  //       is_active: false,
  //     });

  //     // Frontend route will show GaSelectModal using this uuid
  //     return redirect(302, `/connections/ga/select?connection=${encodeURIComponent(connection.connection_uuid)}`);
  //   }

  /**
   * List GA accounts for a given connection.
   */
  @Get('/accounts')
  public async listAccounts(
    @Request() req: express.Request,
    @Query('connection') connection: string,
  ): Promise<ApiSuccessEmpty> {
    if (!connection) throw new ParameterError('Missing connection');

    const admin = await this.getAdminClientForConnection(req, connection);

    const accounts: any[] = [];
    let pageToken: string | undefined;
    do {
      const resp = await admin.accounts.list({ pageSize: 200, pageToken });
      accounts.push(...(resp.data.accounts ?? []));
      pageToken = resp.data.nextPageToken ?? undefined;
    } while (pageToken);

    const obj = {
      accounts: accounts.map((a) => ({
        name: a.name!, // "accounts/123"
        displayName: a.displayName!,
      })),
    }

    return { "status": "ok", results: obj };
  }

  /**
   * List GA properties for a specific account.
   */
  @Get('/properties')
  public async listProperties(
    @Request() req: express.Request,
    @Query() connection: string,
    @Query() account: string, // "accounts/123"
  ): Promise<ApiSuccessEmpty> {
    if (!connection || !account) throw new ParameterError('Missing connection or account');

    const admin = await this.getAdminClientForConnection(req, connection);

    const properties: any[] = [];
    let pageToken: string | undefined;
    do {
      const resp = await admin.properties.list({
        filter: `parent:${account}`,
        pageSize: 200,
        pageToken,
      });
      properties.push(...(resp.data.properties ?? []));
      pageToken = resp.data.nextPageToken ?? undefined;
    } while (pageToken);

    const obj = {
      properties: properties.map((p) => ({
        name: p.name!,               // "properties/151581146"
        displayName: p.displayName!, // e.g., "GA4 - Prod"
        parent: p.parent,
      })),
    };

    return { "status": "ok", results: obj };

  }

  /**
   * Persist the user's selection and (optionally) trigger ingestion.
   */
  @Post('/select')
  public async selectProperty(
    @Request() req: express.Request,
    @Body() body: SelectBody,
  ): Promise<{ ok: true; property_id: string }> {
    const { connectionUuid, account, property } = body ?? ({} as SelectBody);
    if (!connectionUuid || !account || !property) {
      throw new ParameterError('Missing connectionUuid/account/property');
    }

    const propertyId = String(property).split('/')[1]; // "properties/151581146" -> "151581146"

    await req.services.getConnectionsService().createOrUpdate({
      connection_uuid: connectionUuid,
      property_id: propertyId,
      is_active: true,
    });

    // Optional: kick ingestion immediately
    const c = await req.services.getConnectionsService().getConnectionByUuid(connectionUuid);
    if (c && c.type === ConnectionType.GOOGLE_ANALYTICS) {
      runDataIngestion({
        airbyteSource: 'source-google-analytics-data-api',
        refreshToken: c.refresh_token || undefined,
        accessToken: c.access_token,
        propertyId: propertyId,
        userId: req.user?.userId,
      });
    }
    // if (c?.access_token) {
    //   await req.services.getIngestionService().runDataIngestion?.({
    //     airbyteSource: 'source-google-analytics-data-api',
    //     refreshToken: c.refresh_token || undefined,
    //     accessToken: c.access_token,
    //     propertyId: propertyId,
    //   });
    // }

    return { ok: true, property_id: propertyId };
  }

  // ---- helpers ----
  private async getAdminClientForConnection(req: express.Request, connectionUuid: string) {
    const c = await req.services.getConnectionsService().getConnectionByUuid(connectionUuid);
    if (!c || c.type !== ConnectionType.GOOGLE_ANALYTICS) {
      throw new ForbiddenError('Connection not found or wrong type');
    }

    oauth2Client.setCredentials({
      access_token: c.access_token ?? undefined,
      refresh_token: c.refresh_token ?? undefined,
      expiry_date: c.expires_at?.getTime(),
    });

    return google.analyticsadmin({ version: 'v1beta', auth: oauth2Client });
  }
}
