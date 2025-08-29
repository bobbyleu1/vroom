// utils/supabase.js

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://rafyqmwbbagsdugwjaxx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZnlxbXdiYmFnc2R1Z3dqYXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzMzkyODYsImV4cCI6MjA2NjkxNTI4Nn0.IpXi0nO_5tzj_zcap211dRes-dozqX2kmpmGI585X0g';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
