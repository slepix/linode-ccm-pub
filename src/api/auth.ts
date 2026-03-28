import { api } from './client';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'power_user' | 'auditor';
  can_view_compliance: boolean;
}

export type LoginResult =
  | { token: string; user: User; requires_totp?: never }
  | { requires_totp: true; token?: never; user?: never };

export const authApi = {
  registrationOpen: () => api.get<{ open: boolean }>('/api/auth/registration-open'),
  login: (email: string, password: string, totp_code?: string) =>
    api.post<LoginResult>('/api/auth/login', { email, password, totp_code }),
  register: (email: string, password: string, full_name: string) =>
    api.post<{ token: string; user: User }>('/api/auth/register', { email, password, full_name }),
  me: () => api.get<User>('/api/auth/me'),
  logout: () => api.post<void>('/api/auth/logout'),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ ok: boolean }>('/api/auth/change-password', { current_password, new_password }),
  setup2fa: () =>
    api.post<{ secret: string; qr_code: string; uri: string }>('/api/auth/2fa/setup'),
  enable2fa: (code: string) =>
    api.post<{ enabled: boolean }>('/api/auth/2fa/enable', { code }),
  disable2fa: (code: string) =>
    api.post<{ disabled: boolean }>('/api/auth/2fa/disable', { code }),
  get2faStatus: () =>
    api.get<{ enabled: boolean }>('/api/auth/2fa/status'),
  adminDisable2fa: (userId: string) =>
    api.post<{ disabled: boolean }>(`/api/auth/2fa/admin-disable/${userId}`),
};
