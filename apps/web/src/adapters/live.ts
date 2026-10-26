/** Live (realtime, offline-capable) reads for the UI. Hooks over Firestore listeners. */
import { useEffect, useState } from "react";
import { doc, onSnapshot, type Query, type DocumentData } from "firebase/firestore";
import { db } from "../app/firebase";

export interface Live<T> {
  readonly data: T;
  readonly loading: boolean;
  readonly error: Error | null;
  /** True while showing cached data that has not been confirmed by the server. */
  readonly fromCache: boolean;
}

export interface LiveDoc<T> extends Live<T> {
  /** True while the document holds local writes the server has not confirmed yet. */
  readonly pending: boolean;
}

export function useLiveDoc<T>(
  path: string | null,
  map: (id: string, d: Record<string, unknown>) => T,
  opts: { trackPending?: boolean } = {},
): LiveDoc<T | null> {
  const [state, setState] = useState<LiveDoc<T | null> & { path: string | null }>({ path, data: null, loading: !!path, error: null, fromCache: false, pending: false });
  useEffect(() => {
    if (!path) { setState({ path, data: null, loading: false, error: null, fromCache: false, pending: false }); return; }
    setState((s) => ({ ...s, path, loading: true }));
    return onSnapshot(doc(db, path), { includeMetadataChanges: !!opts.trackPending }, (s) => {
      setState({ path, data: s.exists() ? map(s.id, s.data()) : null, loading: false, error: null, fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites });
    }, (error) => setState({ path, data: null, loading: false, error, fromCache: false, pending: false }));
  }, [path]);
  // Until the effect has subscribed to a new path, the old state must not read as "loaded, no document".
  if (state.path !== path) return { data: null, loading: !!path, error: null, fromCache: false, pending: false };
  return state;
}

/**
 * `key` must change whenever the query changes (queries are not comparable by value).
 * Pass `null` as the query to skip loading.
 */
export function useLiveQuery<T>(key: string, q: Query<DocumentData> | null, map: (id: string, d: Record<string, unknown>) => T): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: !!q, error: null, fromCache: false });
  useEffect(() => {
    if (!q) { setState({ data: [], loading: false, error: null, fromCache: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(q, (snap) => {
      setState({ data: snap.docs.map((d) => map(d.id, d.data())), loading: false, error: null, fromCache: snap.metadata.fromCache });
    }, (error) => setState({ data: [], loading: false, error, fromCache: false }));
  }, [key]);
  return state;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}
