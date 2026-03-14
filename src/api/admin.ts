import { api } from './client';

export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  return api.post('/api/admin/run-migrations');
}
