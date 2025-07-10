
// utils/supabase.js

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://rafyqmwbbagsdugwjaxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZnlxbXdiYmFnc2R1Z3dqYXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzMzkyODYsImV4cCI6MjA2NjkxNTI4Nn0.IpXi0nO_5tzj_zcap211dRes-dozqX2kmpmGI585X0g'; // Replace with your actual anon key

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
