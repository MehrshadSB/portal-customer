import { AdminShell } from '@/components/admin-shell';
import * as React from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
