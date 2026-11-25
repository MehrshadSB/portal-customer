import { PortalShell } from '@/components/portal-shell';
import * as React from 'react';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
