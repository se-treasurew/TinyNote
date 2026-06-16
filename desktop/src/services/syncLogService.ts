import { getDb } from '../repositories/db';

export type SyncOperation = 'create' | 'update' | 'delete' | 'import';
export type SyncEntityType = 'task' | 'routine' | 'setting';

export async function writeSyncLog(input: {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: unknown;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO sync_log (id, entity_type, entity_id, operation, payload, created_at, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
    [
      `log_${crypto.randomUUID()}`,
      input.entityType,
      input.entityId,
      input.operation,
      JSON.stringify(input.payload),
      new Date().toISOString(),
    ],
  );
}
