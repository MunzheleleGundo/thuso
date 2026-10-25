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

export function useLiveDoc<T>(path: string | null, map: (id: string, d: Record<string, unknown>) => T): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: !!path, error: null, fromCache: false });
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null, fromCache: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(doc(db, path), { includeMetadataChanges: false }, (s) => {
      setState({ data: s.exists() ? map(s.id, s.data()) : null, loading: false, error: null, fromCache: s.metadata.fromCache });
    }, (error) => setState({ data: null, loading: false, error, fromCache: false }));
  }, [path]);
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
