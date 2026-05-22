/**
 * Helpers de chequeo de rol con soporte de roles extra (multi-rol por
 * composición).
 *
 * Reglas:
 *   - `usuarios.rol` es el rol PRIMARIO (dashboard inicial, branding,
 *     RLS base, comportamiento por defecto).
 *   - `usuario_roles_extra` agrega capacidades adicionales activables
 *     por super_admin / dirección. Un usuario tiene un rol si lo tiene
 *     como primario O lo tiene activo en la tabla de extras.
 *
 * Estos helpers son la ÚNICA forma correcta de chequear roles en
 * componentes y endpoints nuevos. Algunos endpoints legacy todavía
 * chequean `user.rol === 'X'` directamente; eso solo funciona para el
 * rol primario y se irá migrando.
 */

import type { UserRole } from '@/types';

export interface RoleAwareUser {
  rol: UserRole;
  rolesExtra?: UserRole[] | null;
}

/**
 * ¿El usuario tiene el rol dado, ya sea como primario o como extra activo?
 */
export function userHasRole(user: RoleAwareUser | null | undefined, role: UserRole): boolean {
  if (!user) return false;
  if (user.rol === role) return true;
  const extras = user.rolesExtra ?? [];
  return extras.includes(role);
}

/**
 * ¿El usuario tiene al menos uno de los roles dados (primario o extra activo)?
 * Útil para guards que aceptan varios roles autorizados.
 */
export function userHasAnyRole(
  user: RoleAwareUser | null | undefined,
  roles: readonly UserRole[],
): boolean {
  if (!user) return false;
  if (roles.includes(user.rol)) return true;
  const extras = user.rolesExtra ?? [];
  return extras.some((extra) => roles.includes(extra));
}

/**
 * Devuelve la unión deduplicada del rol primario + roles extra activos.
 * Útil para componer menús o políticas de UI.
 */
export function getEffectiveRoles(user: RoleAwareUser | null | undefined): UserRole[] {
  if (!user) return [];
  const set = new Set<UserRole>([user.rol]);
  for (const extra of user.rolesExtra ?? []) {
    set.add(extra);
  }
  return Array.from(set);
}
