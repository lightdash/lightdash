import {
    AgentCodingSession,
    AgentCodingSessionEvent,
    AgentCodingSessionMessage,
    AgentCodingSessionStatus,
    AgentCodingStreamEvent,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AgentCodingSessionEventsTableName,
    AgentCodingSessionMessagesTableName,
    AgentCodingSessionsTableName,
    DbAgentCodingSession,
    DbAgentCodingSessionEvent,
    DbAgentCodingSessionMessage,
} from '../database/entities/agentCodingSessions';

export class AgentCodingSessionModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    // eslint-disable-next-line class-methods-use-this
    private mapDbSessionToSession(db: DbAgentCodingSession): AgentCodingSession {
        return {
            sessionUuid: db.session_uuid,
            projectUuid: db.project_uuid,
            createdByUserUuid: db.created_by_user_uuid,
            githubRepo: db.github_repo,
            githubBranch: db.github_branch,
            status: db.status,
            errorMessage: db.error_message,
            createdAt: db.created_at,
            updatedAt: db.updated_at,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    private mapDbMessageToMessage(
        db: DbAgentCodingSessionMessage,
    ): AgentCodingSessionMessage {
        return {
            messageUuid: db.message_uuid,
            sessionUuid: db.session_uuid,
            role: db.role,
            content: db.content,
            createdAt: db.created_at,
        };
    }

    async createSession(
        projectUuid: string,
        userUuid: string,
        githubRepo: string,
        githubBranch: string,
    ): Promise<AgentCodingSession> {
        const [session] = await this.database(AgentCodingSessionsTableName)
            .insert({
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                github_repo: githubRepo,
                github_branch: githubBranch,
            })
            .returning('*');

        return this.mapDbSessionToSession(session);
    }

    async getSession(sessionUuid: string): Promise<AgentCodingSession> {
        const session = await this.database(AgentCodingSessionsTableName)
            .where('session_uuid', sessionUuid)
            .first();

        if (!session) {
            throw new NotFoundError(`Session not found: ${sessionUuid}`);
        }

        return this.mapDbSessionToSession(session);
    }

    async getSessionWithSandboxId(sessionUuid: string): Promise<
        AgentCodingSession & {
            e2bSandboxId: string | null;
            claudeSessionId: string | null;
        }
    > {
        const session = await this.database(AgentCodingSessionsTableName)
            .where('session_uuid', sessionUuid)
            .first();

        if (!session) {
            throw new NotFoundError(`Session not found: ${sessionUuid}`);
        }

        return {
            ...this.mapDbSessionToSession(session),
            e2bSandboxId: session.e2b_sandbox_id,
            claudeSessionId: session.claude_session_id,
        };
    }

    async listSessionsByUserAndProject(
        userUuid: string,
        projectUuid: string,
    ): Promise<AgentCodingSession[]> {
        const sessions = await this.database(AgentCodingSessionsTableName)
            .where({
                created_by_user_uuid: userUuid,
                project_uuid: projectUuid,
            })
            .orderBy('created_at', 'desc');

        return sessions.map((s) => this.mapDbSessionToSession(s));
    }

    async updateSession(
        sessionUuid: string,
        updates: {
            e2bSandboxId?: string;
            claudeSessionId?: string;
            status?: AgentCodingSessionStatus;
            errorMessage?: string | null;
        },
    ): Promise<AgentCodingSession> {
        const updateData: Record<string, unknown> = {
            updated_at: new Date(),
        };

        if (updates.e2bSandboxId !== undefined) {
            updateData.e2b_sandbox_id = updates.e2bSandboxId;
        }
        if (updates.claudeSessionId !== undefined) {
            updateData.claude_session_id = updates.claudeSessionId;
        }
        if (updates.status !== undefined) {
            updateData.status = updates.status;
        }
        if (updates.errorMessage !== undefined) {
            updateData.error_message = updates.errorMessage;
        }

        const [session] = await this.database(AgentCodingSessionsTableName)
            .where('session_uuid', sessionUuid)
            .update(updateData)
            .returning('*');

        if (!session) {
            throw new NotFoundError(`Session not found: ${sessionUuid}`);
        }

        return this.mapDbSessionToSession(session);
    }

    async deleteSession(sessionUuid: string): Promise<void> {
        const deleted = await this.database(AgentCodingSessionsTableName)
            .where('session_uuid', sessionUuid)
            .delete();

        if (deleted === 0) {
            throw new NotFoundError(`Session not found: ${sessionUuid}`);
        }
    }

    // Message methods

    async createMessage(
        sessionUuid: string,
        role: 'user' | 'assistant',
        content: string,
    ): Promise<AgentCodingSessionMessage> {
        const [message] = await this.database(
            AgentCodingSessionMessagesTableName,
        )
            .insert({
                session_uuid: sessionUuid,
                role,
                content,
            })
            .returning('*');

        return this.mapDbMessageToMessage(message);
    }

    async getMessagesBySession(
        sessionUuid: string,
    ): Promise<AgentCodingSessionMessage[]> {
        const messages = await this.database(
            AgentCodingSessionMessagesTableName,
        )
            .where('session_uuid', sessionUuid)
            .orderBy('created_at', 'asc');

        return messages.map((m) => this.mapDbMessageToMessage(m));
    }

    // Event methods for streaming

    // eslint-disable-next-line class-methods-use-this
    private mapDbEventToEvent(
        db: DbAgentCodingSessionEvent,
    ): AgentCodingSessionEvent {
        return {
            eventId: db.event_id,
            sessionUuid: db.session_uuid,
            event: db.payload as unknown as AgentCodingStreamEvent,
            createdAt: db.created_at,
        };
    }

    /**
     * Append an event to the session.
     * Returns the assigned event ID (used for SSE Last-Event-ID).
     */
    async appendEvent(
        sessionUuid: string,
        event: AgentCodingStreamEvent,
    ): Promise<number> {
        const [inserted] = await this.database(AgentCodingSessionEventsTableName)
            .insert({
                session_uuid: sessionUuid,
                event_type: event.type,
                payload: event,
            })
            .returning('event_id');

        return inserted.event_id;
    }

    /**
     * Get events since a given event ID (for streaming/reconnection).
     * Returns events with event_id > afterEventId, ordered by event_id.
     */
    async getEventsSince(
        sessionUuid: string,
        afterEventId: number,
    ): Promise<AgentCodingSessionEvent[]> {
        const events = await this.database(AgentCodingSessionEventsTableName)
            .where('session_uuid', sessionUuid)
            .where('event_id', '>', afterEventId)
            .orderBy('event_id', 'asc');

        return events.map((e) => this.mapDbEventToEvent(e));
    }

    /**
     * Prune all events for a completed session.
     */
    async pruneEventsForSession(sessionUuid: string): Promise<void> {
        await this.database(AgentCodingSessionEventsTableName)
            .where('session_uuid', sessionUuid)
            .delete();
    }

    /**
     * Bulk prune events older than a given date (for scheduled cleanup).
     * Returns the number of deleted events.
     */
    async pruneOldEvents(olderThan: Date): Promise<number> {
        return this.database(AgentCodingSessionEventsTableName)
            .where('created_at', '<', olderThan)
            .delete();
    }
}
