import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabase';

const PAGE_SIZE = 12;
const PRELOAD_AHEAD = 6;
const COOLDOWN_RECENT = 40; // don't repeat items seen within last 40
const MAX_POOL = 250;

export interface Post {
  id: string;
  created_at: string;
  media_url: string;
  thumbnail_url?: string;
  content?: string;
  file_type: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  author_id: string;
  playback_id?: string;
  profiles?: {
    username: string;
    avatar_url: string;
  };
}

const uniqAppend = <T extends {id: string}>(base: T[], next: T[]): T[] => {
  const seen = new Set(base.map(i => i.id));
  for (const n of next) {
    if (!seen.has(n.id)) {
      base.push(n);
    }
  }
  return base;
};

export function useEndlessFeed(userId?: string) {
  const [items, setItems] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewIndexRef = useRef(0);
  const recentIdsRef = useRef<string[]>([]);
  const beforeCursorRef = useRef<{created_at: string; id: string} | null>(null);

  const markSeen = useCallback(async (postId: string) => {
    // client ring buffer
    recentIdsRef.current.push(postId);
    if (recentIdsRef.current.length > MAX_POOL) {
      recentIdsRef.current = recentIdsRef.current.slice(-MAX_POOL);
    }
    // write-through to server (fire-and-forget)
    if (userId) {
      supabase
        .from('user_seen_posts')
        .upsert({ user_id: userId, post_id: postId })
        .then(() => {})
        .catch(() => {});
    }
  }, [userId]);

  // --- fetch older page (infinite scroll, keyset: <
  const fetchOlder = useCallback(async () => {
    if (loading) return;
    console.log('fetchOlder: Starting fetch...');
    setLoading(true);
    setError(null);

    const cursor = beforeCursorRef.current;

    try {
      // Use direct query for now to avoid RPC issues
      let query = supabase
        .from('posts')
        .select(`
          id,
          created_at,
          media_url,
          thumbnail_url,
          content,
          file_type,
          like_count,
          comment_count,
          view_count,
          author_id,
          playback_id,
          profiles:profiles!author_id (
            username,
            avatar_url
          )
        `)
        .eq('file_type', 'video')
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) {
        query = query.lt('created_at', cursor.created_at);
      }

      const { data, error } = await query;

      if (error) {
        setError(error.message);
      } else {
        const rows = (data ?? []) as Post[];
        console.log(`Fetched ${rows.length} posts (page size: ${PAGE_SIZE})`);
        
        setItems(prev => {
          const next = uniqAppend([...prev], rows);
          if (next.length > MAX_POOL) {
            next.splice(0, next.length - MAX_POOL);
          }
          return next;
        });
        
        if (!rows.length || rows.length < PAGE_SIZE) {
          console.log('Reached end of fresh content, enabling infinite loop mode');
          // Don't set hasMore to false - social feeds should never end
          // The maybeLoopFill function will handle recycling content
          setHasMore(false); // This triggers loop mode in maybeLoopFill
        } else {
          const last = rows[rows.length - 1]!;
          beforeCursorRef.current = { created_at: last.created_at, id: last.id };
          console.log('Set cursor to:', last.created_at, last.id);
        }
      }
    } catch (err) {
      console.error('Error in fetchOlder:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }

    setLoading(false);
  }, [loading, userId]);

  // --- refresh newer (pull-to-refresh, keyset: >)
  const refreshNewer = useCallback(async () => {
    if (refreshing || !items.length) {
      // if empty, just initial load
      if (!items.length) return fetchOlder();
      return;
    }
    
    setRefreshing(true);
    setError(null);
    const head = items[0];

    try {
      // Use direct query for refresh
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          created_at,
          media_url,
          thumbnail_url,
          content,
          file_type,
          like_count,
          comment_count,
          view_count,
          author_id,
          playback_id,
          profiles:profiles!author_id (
            username,
            avatar_url
          )
        `)
        .eq('file_type', 'video')
        .not('media_url', 'is', null)
        .gt('created_at', head.created_at)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) {
        setError(error.message);
      } else {
        const rows = (data ?? []) as Post[];
        console.log(`Refresh fetched ${rows.length} newer posts`);
        if (rows.length) {
          // Prepend newer items (keep deterministic order)
          const dedupbed = rows.filter(r => !items.find(i => i.id === r.id));
          setItems(prev => [...dedupbed, ...prev]);
        }
        // If zero newer rows, do nothing (no shuffle) — UI can show "You're all caught up"
      }
    } catch (err) {
      console.error('Error in refreshNewer:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }

    setRefreshing(false);
  }, [items, refreshing, userId, fetchOlder]);

  // --- loop mode when no more fresh pages (infinite social feed)
  const maybeLoopFill = useCallback(() => {
    if (hasMore) return;
    
    const idx = viewIndexRef.current;
    const currentItems = itemsRef.current;
    const endBuffer = currentItems.length - idx - 1;
    if (endBuffer > PRELOAD_AHEAD) return;

    console.log('[ENDLESS FEED] Loop mode: recycling content for infinite scroll');

    const recent = new Set(recentIdsRef.current.slice(-COOLDOWN_RECENT));
    const candidates: Post[] = [];
    
    // First, try to get non-recent content
    for (const p of currentItems) {
      if (!recent.has(p.id)) {
        candidates.push(p);
      }
      if (candidates.length >= PAGE_SIZE) break;
    }
    
    // If not enough non-recent content, use shuffled existing content
    if (candidates.length < PAGE_SIZE) {
      const shuffled = [...currentItems].sort(() => Math.random() - 0.5);
      for (const p of shuffled) {
        if (candidates.length >= PAGE_SIZE) break;
        if (!candidates.find(c => c.id === p.id)) {
          candidates.push(p);
        }
      }
    }
    
    // Last resort: duplicate everything to keep feed infinite
    if (candidates.length === 0 && currentItems.length > 0) {
      candidates.push(...currentItems.slice(0, Math.min(PAGE_SIZE, currentItems.length)));
    }
    
    if (candidates.length > 0) {
      console.log(`[ENDLESS FEED] Added ${candidates.length} recycled posts to maintain infinite scroll`);
      setItems(prev => [...prev, ...candidates]);
    } else {
      console.log('[ENDLESS FEED] No content available to recycle, feed may appear empty');
    }
  }, [hasMore]);

  // Use refs to avoid stale closures while preventing infinite loops
  const fetchOlderRef = useRef(fetchOlder);
  const maybeLoopFillRef = useRef(maybeLoopFill);
  const itemsRef = useRef(items);
  const hasMoreRef = useRef(hasMore);

  // Update refs
  useEffect(() => {
    fetchOlderRef.current = fetchOlder;
    maybeLoopFillRef.current = maybeLoopFill;
    itemsRef.current = items;
    hasMoreRef.current = hasMore;
  });

  const onViewable = useCallback((index: number, postId: string) => {
    viewIndexRef.current = index;
    markSeen(postId);

    const endBuffer = itemsRef.current.length - index - 1;
    if (endBuffer <= PRELOAD_AHEAD) {
      if (hasMoreRef.current) {
        fetchOlderRef.current();
      } else {
        maybeLoopFillRef.current();
      }
    }
  }, [markSeen]);

  // initial load - use ref to prevent multiple calls
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current && userId) {
      initialLoadDone.current = true;
      fetchOlder();
    }
  }, [userId]); // Only depend on userId

  return {
    items,
    loading,
    refreshing,
    error,
    fetchOlder,
    refreshNewer,
    onViewable
  };
}