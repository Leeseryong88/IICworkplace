"use client";
import { useEffect, useMemo, useState } from 'react'
import { auth } from './firebase'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth'

export function useAuth() {
  const [user, setUser] = useState<ReturnType<typeof auth.currentUser> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return useMemo(() => ({ user, loading }), [user, loading])
}

export async function emailSignIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function emailSignUp(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email)
}

export async function signOut() {
  return auth.signOut()
}


