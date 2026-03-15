import { api } from './client';

export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  return api.post('/api/admin/run-migrations');
}

export async function getSyncSchedule(): Promise<{ interval_minutes: number }> {
  return api.get('/api/admin/settings/sync-schedule');
}

export async function updateSyncSchedule(interval_minutes: number): Promise<{ success: boolean; interval_minutes: number }> {
  return api.put('/api/admin/settings/sync-schedule', { interval_minutes });
}
