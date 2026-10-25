import {
  createUserWithEmailAndPassword, GoogleAuthProvider, reload, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { C } from "@thuso/core";
import { auth, db } from "../app/firebase";

const continueUrl = () => `${location.origin}/onboarding`;

export async function signUpWithEmail(name: string, email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: name.trim() });
  await setDoc(doc(db, `${C.users}/${cred.user.uid}`), { name: name.trim(), email: email.trim().toLowerCase(), createdAt: serverTimestamp() }, { merge: true });
  await sendEmailVerification(cred.user, { url: continueUrl() });
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return (await signInWithPopup(auth, provider)).user;
}

export const resendVerification = (user: User) => sendEmailVerification(user, { url: continueUrl() });
export const sendReset = (email: string) => sendPasswordResetEmail(auth, email.trim(), { url: `${location.origin}/signin` });
export const logOut = () => signOut(auth);

/** Re-read the account and refresh the ID token so security rules see email_verified=true. */
export async function refreshVerification(user: User): Promise<boolean> {
  await reload(user);
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
}

/** Plain-language messages for Firebase Auth error codes. */
export function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "That email and password do not match. Try again or reset your password.",
    "auth/wrong-password": "That email and password do not match. Try again or reset your password.",
    "auth/user-not-found": "That email and password do not match. Try again or reset your password.",
    "auth/email-already-in-use": "There is already an account with this email. Sign in instead.",
    "auth/weak-password": "Choose a stronger password: at least 8 characters with letters and numbers.",
    "auth/invalid-email": "That email address does not look right.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "No connection. Check your data or Wi-Fi and try again.",
    "auth/popup-closed-by-user": "The Google window was closed before you finished.",
    "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
    "auth/account-exists-with-different-credential": "This email is already registered with a password. Sign in with email instead.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Use both letters and numbers.";
  if (/^(password|12345678|qwerty|thuso)/i.test(pw)) return "That password is too easy to guess.";
  return null;
}
