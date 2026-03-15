import { api } from './client';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'power_user' | 'auditor';
  can_view_costs: boolean;
  can_view_compliance: boolean;
}

export const authApi = {
  registrationOpen: () => api.get<{ open: boolean }>('/api/auth/registration-open'),
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/api/auth/login', { email, password }),
  register: (email: string, password: string, full_name: string) =>
    api.post<{ token: string; user: User }>('/api/auth/register', { email, password, full_name }),
  me: () => api.get<User>('/api/auth/me'),
  logout: () => api.post<void>('/api/auth/logout'),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ ok: boolean }>('/api/auth/change-password', { current_password, new_password }),
};
