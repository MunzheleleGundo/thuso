import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { canManage, canWrite, C, isEnabled, type Business, type DomainError, type ModuleId, type Role } from "@thuso/core";
import { db, readers } from "./adapters/firestore";

export interface MemberContext {
  readonly uid: string;
  readonly name: string;
  readonly role: Role;
  readonly business: Business;
}

/** Functions bypass security rules, so each one checks the caller here. */
export async function requireMember(
  req: CallableRequest<unknown>, bizId: unknown, opts: { write?: boolean; manage?: boolean; module?: ModuleId } = {},
): Promise<MemberContext> {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Please sign in again.");
  if (auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Please verify your email first.");
  if (typeof bizId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(bizId)) throw new HttpsError("invalid-argument", "Missing business.");
  const [member, business] = await Promise.all([
    db().doc(`${C.businesses}/${bizId}/${C.members}/${auth.uid}`).get(),
    readers().businesses.get(bizId),
  ]);
  if (!member.exists || !business) throw new HttpsError("permission-denied", "You are not part of this business.");
  const role = member.get("role") as Role;
  if (opts.write && !canWrite(role)) throw new HttpsError("permission-denied", "Your role can view but not change this.");
  if (opts.manage && !canManage(role)) throw new HttpsError("permission-denied", "Only the owner or an admin can do this.");
  if (opts.module && !isEnabled(business.enabledModules, opts.module)) throw new HttpsError("failed-precondition", "This tool is switched off for your business.");
  return { uid: auth.uid, name: (member.get("name") as string) || (auth.token.name as string) || "Member", role, business };
}

/** Turn a domain error into the matching callable error, keeping the plain-language message. */
export function fail(e: DomainError): never {
  const code = ({
    validation: "invalid-argument", not_found: "not-found", conflict: "already-exists", duplicate: "already-exists",
    invalid_state: "failed-precondition", module_disabled: "failed-precondition", forbidden: "permission-denied", unavailable: "unavailable",
  } as const)[e.code];
  throw new HttpsError(code, e.message, { code: e.code, field: e.field });
}

export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
