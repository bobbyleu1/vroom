// contexts/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../utils/supabase';
import { setupPushNotificationsWithFeedback } from '../utils/enhancedNotificationService';
import { ensureUserProfile } from '../utils/profileHelpers';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eulaAccepted, setEulaAccepted] = useState(null); // Start with null to indicate uninitialized
  
  // EULA cache key for current user
  const getEulaCacheKey = (userId) => `eula_accepted_${userId}`;
  
  // In-memory flag to prevent multiple simultaneous EULA checks
  const [eulaCheckInProgress, setEulaCheckInProgress] = useState(false);
  
  // Track if we've already confirmed EULA for this session
  const sessionEulaConfirmed = React.useRef(false);

  // Debug wrapper for setEulaAccepted to track changes
  const setEulaAcceptedWithLogging = (value) => {
    console.log('[AUTH DEBUG] EULA state changing from', eulaAccepted, 'to', value);
    setEulaAccepted(value);
  };

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error);
        } else {
          setSession(session);
          setUser(session?.user ?? null);
          
          // Ultra-fast EULA check - session-aware and cache-optimized
          if (session?.user) {
            // If already confirmed in this session, skip all checks
            if (sessionEulaConfirmed.current) {
              console.log('[AUTH INIT] EULA already confirmed in this session');
              if (!eulaAccepted) {
                setEulaAcceptedWithLogging(true);
              }
              return;
            }
            
            // Prevent multiple simultaneous checks
            if (eulaCheckInProgress) {
              console.log('[AUTH INIT] EULA check already in progress');
              return;
            }
            
            const loadEulaStatus = async () => {
              setEulaCheckInProgress(true);
              try {
                // Lightning-fast cache check first
                const cacheKey = getEulaCacheKey(session.user.id);
                const cachedValue = await AsyncStorage.getItem(cacheKey);
                
                if (cachedValue === 'true') {
                  console.log('[AUTH INIT] EULA found in cache - instant accept');
                  sessionEulaConfirmed.current = true;
                  setEulaAcceptedWithLogging(true);
                  return;
                }
                
                console.log('[AUTH INIT] Cache miss - checking database...');
                // Don't set to false yet - only after DB confirms
                
                // Ultra-short timeout for database check
                const timeoutPromise = new Promise((_, reject) => {
                  setTimeout(() => reject(new Error('EULA timeout')), 800);
                });
                
                const checkPromise = supabase
                  .from('profiles')
                  .select('eula_accepted')
                  .eq('id', session.user.id)
                  .single();
                
                const { data: profile, error } = await Promise.race([checkPromise, timeoutPromise]);
                
                if (!error && profile?.eula_accepted) {
                  // Cache for instant future access & mark session confirmed
                  await AsyncStorage.setItem(cacheKey, 'true');
                  sessionEulaConfirmed.current = true;
                  setEulaAcceptedWithLogging(true);
                  console.log('[AUTH INIT] EULA accepted - cached & session confirmed');
                } else {
                  // Only set to false if we confirmed user doesn't have EULA accepted
                  console.log('[AUTH INIT] EULA not accepted in database');
                  setEulaAcceptedWithLogging(false);
                }
              } catch (error) {
                console.log('[AUTH INIT] EULA check failed (non-critical):', error.message);
                setEulaAcceptedWithLogging(false);
              } finally {
                setEulaCheckInProgress(false);
              }
            };
            
            // Non-blocking load
            loadEulaStatus();
          } else {
            if (eulaAccepted !== false) {
              setEulaAcceptedWithLogging(false);
            }
            sessionEulaConfirmed.current = false;
          }
        }
      } catch (error) {
        console.error('Error initializing session:', error);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Fast EULA check for auth state changes with cache
      if (session?.user) {
        const loadAuthEulaStatus = async () => {
          try {
            // Check local cache first for instant response
            const cacheKey = getEulaCacheKey(session.user.id);
            const cachedValue = await AsyncStorage.getItem(cacheKey);
            
            if (cachedValue === 'true') {
              console.log('[AUTH] EULA found in cache - accepting immediately');
              setEulaAcceptedWithLogging(true);
              return;
            }
            
            console.log('[AUTH] No EULA cache, checking database...');
            // Don't set false until we confirm from database
            
            // Quick database check
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Auth EULA timeout')), 1000);
            });
            
            const checkPromise = supabase
              .from('profiles')
              .select('eula_accepted')
              .eq('id', session.user.id)
              .single();
            
            const { data: profile, error } = await Promise.race([checkPromise, timeoutPromise]);
            
            if (!error && profile?.eula_accepted) {
              // Cache for future instant access
              await AsyncStorage.setItem(cacheKey, 'true');
              setEulaAcceptedWithLogging(true);
              console.log('[AUTH] EULA accepted - cached');
            } else {
              // Confirmed not accepted - now safe to set false
              console.log('[AUTH] EULA not accepted in database');
              setEulaAcceptedWithLogging(false);
            }
          } catch (error) {
            console.log('[AUTH] Auth EULA check failed:', error.message);
            setEulaAcceptedWithLogging(false);
          }
        };
        
        // Non-blocking load
        loadAuthEulaStatus();
      } else {
        if (eulaAccepted !== false) {
          setEulaAcceptedWithLogging(false);
        }
      }
      
      // Initialize push notifications and profile when user signs in
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('Initializing user services for:', session.user.email);
        
        // Run in background - don't block UI with automatic setup
        Promise.all([
          setupPushNotificationsWithFeedback(false), // No user prompts - automatic setup
          ensureUserProfile(session.user.id, session.user.email)
        ]).catch(error => {
          console.error('Background initialization failed:', error);
        });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.log(error);
  };

  const refreshEulaStatus = async () => {
    // Simplified refresh - mainly for manual calls, not blocking
    if (session?.user) {
      try {
        console.log('[AUTH] Quick EULA status refresh for user:', session.user.id);
        
        // Very short timeout to prevent any hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('EULA refresh timeout')), 1000);
        });
        
        const fetchPromise = supabase
          .from('profiles')
          .select('eula_accepted')
          .eq('id', session.user.id)
          .single();
        
        const { data: profile, error } = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!error && profile?.eula_accepted) {
          setEulaAcceptedWithLogging(true);
          console.log('[AUTH] EULA refresh successful:', true);
          return true;
        } else {
          console.log('[AUTH] EULA refresh - no acceptance found');
          return false;
        }
      } catch (error) {
        console.log('[AUTH] EULA refresh failed (non-critical):', error.message);
        return null;
      }
    }
    return null;
  };

  // Force set EULA accepted state with session tracking
  const forceSetEulaAccepted = async (accepted) => {
    console.log('[AUTH] Force setting EULA accepted state to:', accepted);
    setEulaAcceptedWithLogging(accepted);
    
    // Mark session as confirmed and cache
    if (accepted) {
      sessionEulaConfirmed.current = true;
      
      if (session?.user) {
        try {
          const cacheKey = getEulaCacheKey(session.user.id);
          await AsyncStorage.setItem(cacheKey, 'true');
          console.log('[AUTH] EULA acceptance cached & session marked');
        } catch (error) {
          console.log('[AUTH] Cache failed but session marked (non-critical):', error.message);
        }
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, eulaAccepted, signUp, signIn, signOut, refreshEulaStatus, forceSetEulaAccepted }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
