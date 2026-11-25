import type { AppSurface, SessionUser, UserType } from '@portal/types';
import type { Request } from 'express';

export interface AuthenticatedActor extends SessionUser {
  employeeId: string | null;
  tokenVersion: number;
}

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface RequestWithAuth extends Request {
  appSurface?: AppSurface;
  user?: AuthenticatedActor;
  requestId?: string;
}

export function expectedUserTypeForSurface(surface: AppSurface): UserType {
  return surface === 'portal' ? 'customer' : 'employee';
}
