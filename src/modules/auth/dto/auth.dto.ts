import type { UserWithAuth } from '../repositories/auth.repository.js';

export function extractRolesAndPermissions(user: UserWithAuth): {
  roles: string[];
  permissions: string[];
} {
  const roles = user.userRoles.map((ur) => ur.role.code);
  const permissionSet = new Set<string>();

  for (const ur of user.userRoles) {
    for (const rp of ur.role.rolePermissions) {
      permissionSet.add(rp.permission.code);
    }
  }

  return {
    roles,
    permissions: [...permissionSet],
  };
}

export function toPublicUser(user: UserWithAuth) {
  const { roles, permissions } = extractRolesAndPermissions(user);

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    emailVerifiedAt: user.emailVerifiedAt,
    roles,
    permissions,
  };
}
