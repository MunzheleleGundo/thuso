/**
 * Who is signed in, which business they are working in, and their role there.
 * Everything is live: if the owner switches a tool off, every open tab updates.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { C, fromStored, type Actor, type Business, type Member, type Role } from "@thuso/core";
import { useLiveDoc } from "../adapters/live";
import { auth, db } from "./firebase";

interface UserDoc { activeBizId?: string; name?: string; email?: string }

export interface Session {
  readonly ready: boolean;
  readonly user: User | null;
  readonly verified: boolean;
  readonly business: Business | null;
  readonly member: Member | null;
  readonly role: Role;
  readonly actor: Actor;
  /** True once we know whether the user has a business (avoids flicker in guards). */
  readonly businessReady: boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => onIdTokenChanged(auth, (u) => {
    setUser(u);
    setVerified(!!u?.emailVerified);
    setAuthReady(true);
  }), []);

  // Make sure every signed-in user has a profile document.
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, `${C.users}/${user.uid}`);
    getDoc(ref).then((s) => {
      if (!s.exists()) return setDoc(ref, { name: user.displayName ?? "", email: user.email ?? "", createdAt: serverTimestamp() }, { merge: true });
    }).catch(() => undefined);
  }, [user]);

  const userDoc = useLiveDoc<UserDoc>(user ? `${C.users}/${user.uid}` : null, (_id, d) => d as UserDoc, { trackPending: true });
  // A new business is readable only once the server has its membership; listening earlier is
  // rejected by the rules and the listener never recovers.
  const bizId = userDoc.pending ? null : userDoc.data?.activeBizId ?? null;
  const business = useLiveDoc(verified && bizId ? `${C.businesses}/${bizId}` : null, fromStored.business);
  const member = useLiveDoc(verified && bizId && user ? `${C.businesses}/${bizId}/${C.members}/${user.uid}` : null, fromStored.member);

  const value = useMemo<Session>(() => {
    const businessReady = !user || !verified || (!userDoc.loading && !userDoc.pending && (!bizId || (!business.loading && !member.loading)));
    return {
      ready: authReady,
      user,
      verified,
      business: business.data && member.data ? business.data : null,
      member: member.data,
      role: member.data?.role ?? "viewer",
      actor: { uid: user?.uid ?? "", name: member.data?.name || user?.displayName || user?.email || "Member" },
      businessReady,
    };
  }, [authReady, user, verified, userDoc.loading, userDoc.pending, bizId, business.data, business.loading, member.data, member.loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/** For pages inside the workspace, where a business is guaranteed by the route guard. */
export function useWorkspace() {
  const s = useSession();
  if (!s.business || !s.user) throw new Error("useWorkspace used outside a workspace route");
  return { ...s, business: s.business, user: s.user, bizId: s.business.id };
}
