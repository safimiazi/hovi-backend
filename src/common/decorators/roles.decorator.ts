import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../constants/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Sets required roles metadata for the RolesGuard.
 *
 * Usage: @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
