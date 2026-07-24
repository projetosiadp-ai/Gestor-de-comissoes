import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, firebaseConfigured } from '../services/firebaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(firebaseConfigured);

  const loadProfile = useCallback(async currentUser => {
    if (!currentUser || !db) {
      setProfile(null);
      return null;
    }
    const snapshot = await getDoc(doc(db, 'users', currentUser.uid));
    const nextProfile = snapshot.exists() ? snapshot.data() : null;
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  useEffect(() => {
    if (!firebaseConfigured || !auth) return undefined;
    return onAuthStateChanged(auth, async currentUser => {
      setLoading(true);
      setUser(currentUser);
      try {
        await loadProfile(currentUser);
      } finally {
        setLoading(false);
      }
    });
  }, [loadProfile]);

  const login = async (email, password) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await loadProfile(credential.user);
  };

  const register = async ({ email, password, displayName }) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const newProfile = {
      displayName: String(displayName || '').trim().slice(0, 120),
      email: credential.user.email,
      role: 'operator',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'users', credential.user.uid), newProfile);
    setProfile(newProfile);
  };

  const logout = () => signOut(auth);
  const actor = useMemo(() => (user ? {
    uid: user.uid,
    email: user.email || null,
    displayName: profile?.displayName || null
  } : null), [user, profile]);

  const value = useMemo(() => ({
    configured: firebaseConfigured,
    user,
    profile,
    actor,
    loading,
    isAdmin: profile?.role === 'admin' && profile?.status === 'approved',
    login,
    register,
    logout,
    refreshProfile: () => loadProfile(user)
  }), [user, profile, actor, loading, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return value;
}
