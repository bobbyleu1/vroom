import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { PAGE_SIZE, PRELOAD_AHEAD, MAX_POOL, COOLDOWN_RECENT } from './constants';
import { loadSeen, saveSeen, rememberSeen, clearSeen } from './seenStore';
import { FEED_FORCE_BASIC_QUERY } from './diag';

type Post = { id: string; created_at: string };
type Cursor = { created_at: string; id: string } | null;

// Use minimal select that we know works from RPC data
const FEED_SELECT = 
  'id, created_at, content, author_id, media_url, playback_id, thumbnail_url, like_count, comment_count, profiles!posts_author_id_fkey(username, avatar_url)';

const uniqAppend = <T extends {id:string}>(base:T[], next:T[]) => {
  const seen = new Set(base.map(i=>i.id));
  for (const n of next) if (!seen.has(n.id)) base.push(n);
  return base;
};

export function useEndlessFeedV2() {
  const [items, setItems] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string|null>(null);

  const beforeRef = useRef<Cursor>(null);
  const viewIndexRef = useRef(0);
  const seenRef = useRef<{entries:{id:string,ts:number}[]}>({ entries: [] });

  // ---------- helpers
  const topCreated = () => items[0]?.created_at ?? null;
  const excludeIds = () => {
    // Take only the last COOLDOWN_RECENT IDs to exclude
    const arr = seenRef.current.entries.slice(-COOLDOWN_RECENT).map(e => e.id);
    // de-dupe short array
    return Array.from(new Set(arr)).slice(-COOLDOWN_RECENT);
  };

  async function basicQuery(params: { before?: Cursor; since?: string | null; limit?: number; }) {
    console.log('[FEED] path=', 'BASIC', 'FEED_SELECT=', FEED_SELECT);
    
    // First try to get a mix of recent posts and some videos
    if (!params.before && !params.since) {
      console.log('[FEED] Getting mixed content (images + videos)...');
      
      // Get recent posts (last 7 days)
      const recentQuery = supabase
        .from('posts')
        .select(FEED_SELECT)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(Math.floor((params.limit ?? PAGE_SIZE) / 2));
        
      // Get some video posts
      const videoQuery = supabase
        .from('posts')
        .select(FEED_SELECT)
        .like('media_url', '%.mp4')
        .order('created_at', { ascending: false })
        .limit(Math.floor((params.limit ?? PAGE_SIZE) / 2));
        
      const [recentResult, videoResult] = await Promise.all([recentQuery, videoQuery]);
      
      if (recentResult.error || videoResult.error) {
        console.warn('Mixed query failed, falling back to standard query');
      } else {
        // Combine and shuffle results
        const combined = [...(recentResult.data ?? []), ...(videoResult.data ?? [])];
        const uniqueById = new Map();
        combined.forEach(post => uniqueById.set(post.id, post));
        const mixed = Array.from(uniqueById.values())
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, params.limit ?? PAGE_SIZE);
          
        console.log(`[FEED] mixed query success: ${mixed.length} posts (${mixed.filter(p => p.media_url?.includes('.mp4')).length} videos)`);
        const ex = new Set(excludeIds());
        const filtered = mixed.filter(r => !ex.has(r.id));
        console.log('[FEED] filtered mixed results:', filtered.length);
        return filtered;
      }
    }
    
    // Standard query for pagination or if mixed query fails
    const q = supabase
      .from('posts')
      .select(FEED_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit ?? PAGE_SIZE);
    if (params.before) {
      q.lt('created_at', params.before.created_at)
       .or(`and(created_at.eq.${params.before.created_at},id.lt.${params.before.id})`);
    }
    if (params.since) q.gt('created_at', params.since);
    console.log('[FEED] executing basic query...');
    const { data, error } = await q;
    console.log('[FEED] basic query result:', error ? 'ERROR' : 'SUCCESS', 'data length:', data?.length);
    if (error) {
      console.error('[FEED] basic query error:', error);
      throw error;
    }
    const ex = new Set(excludeIds());
    const filtered = (data ?? []).filter(r => !ex.has(r.id));
    console.log('[FEED] filtered results:', filtered.length);
    return filtered;
  }

  const fetchOlder = useCallback(async () => {
    if (loading) return;
    console.log('fetchOlder: Starting fetch...');
    setLoading(true); setError(null);
    const c = beforeRef.current;

    try {
      // For pagination, get older posts from ALL content (don't restrict to recent dates)
      console.log('[FEED] fetchOlder: Loading more content from full database');
      
      const olderQuery = supabase
        .from('posts')
        .select(FEED_SELECT)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      
      // Apply cursor pagination if we have a reference point
      if (c) {
        console.log('[FEED] Using cursor pagination from:', c.created_at, c.id);
        olderQuery.lt('created_at', c.created_at);
      }
      
      const { data, error } = await olderQuery;
      
      if (error) {
        console.error('[FEED] fetchOlder error:', error);
        throw error;
      }
      
      const rows = data || [];
      console.log(`[FEED] fetchOlder: Found ${rows.length} posts`);
      
      // Filter out already seen posts (be less aggressive for pagination)
      const excludeSet = new Set(excludeIds().slice(-5)); // Only exclude last 5 seen items for pagination
      const filtered = rows.filter(r => !excludeSet.has(r.id));
      console.log(`[FEED] fetchOlder: After filtering (excluded ${excludeSet.size} recent): ${filtered.length} posts`);

      setItems(prev => {
        const next = uniqAppend([...prev], filtered);
        if (next.length > MAX_POOL) next.splice(0, next.length - MAX_POOL);
        return next;
      });
      
      // Always advance cursor regardless of filtering
      if (rows.length > 0) {
        const last = rows[rows.length - 1]!;
        beforeRef.current = { created_at: last.created_at, id: last.id };
        console.log('[FEED] Set cursor to:', last.created_at, last.id);
      }
      
      if (!filtered.length) {
        console.log('[FEED] No new posts after filtering, adding unfiltered results...');
        // If filtering removed everything, add raw results but still advance pagination
        setItems(prev => {
          const next = uniqAppend([...prev], rows);
          if (next.length > MAX_POOL) next.splice(0, next.length - MAX_POOL);
          return next;
        });
      }
      
      // Only set hasMore to false if we got NO results from database at all
      // AND we tried multiple times (not just filtering)
      if (!rows.length) {
        console.log('[FEED] No more items in database, setting hasMore to false');
        setHasMore(false);
      } else if (rows.length < PAGE_SIZE) {
        // If we got some results but less than page size, we're near the end
        console.log(`[FEED] Got ${rows.length} items (less than page size ${PAGE_SIZE}), still has more but nearing end`);
        // Don't set hasMore to false yet - there might be more after filtering
      }
      
    } catch (err) {
      console.error('[FEED] fetchOlder failed:', err);
      setError(`Failed to load more posts: ${err.message || err}`);
    }
    
    setLoading(false);
  }, [loading]);

  const refreshNewer = useCallback(async () => {
    if (refreshing) return;
    console.log('refreshNewer: Starting refresh...');
    setRefreshing(true); setError(null);
    const head = items[0];

    try {
      let rows: Post[];

      if (FEED_FORCE_BASIC_QUERY) throw new Error('FORCE_BASIC');

      // Try RPC (server exclusion)
      console.log('[FEED] path=', 'RPC');
      const { data, error } = await supabase.rpc('get_feed_page_excluding', {
        p_limit: PAGE_SIZE,
        p_before_created: null,
        p_before_id: null,
        p_since_created: head?.created_at ?? null,
        p_exclude_ids: excludeIds()
      });

      if (error) throw error;
      rows = (data ?? []) as Post[];
    } catch (rpcError) {
      console.warn('RPC failed, falling back to basic query:', rpcError);
      // Fallback to basic query
      try {
        rows = await basicQuery({
          before: null,
          since: head?.created_at ?? null,
          limit: PAGE_SIZE
        });
      } catch (basicError) {
        console.error('Basic query also failed:', basicError);
        setError(`Refresh failed: ${basicError.message || basicError}`);
        setRefreshing(false);
        return;
      }
    }

    if (rows.length) {
      console.log(`Found ${rows.length} newer posts to prepend`);
      const toPrepend = rows.filter(r => !items.find(i => i.id === r.id));
      setItems(prev => [...toPrepend, ...prev]);
    } else {
      console.log('No newer posts found');
    }
    setRefreshing(false);
  }, [items, refreshing]);

  const maybePrefetch = useCallback(() => {
    const idx = viewIndexRef.current;
    const endBuffer = items.length - idx - 1;
    console.log(`maybePrefetch: idx=${idx}, endBuffer=${endBuffer}, hasMore=${hasMore}`);
    
    if (endBuffer <= PRELOAD_AHEAD) {
      if (hasMore) {
        console.log('Prefetching more items');
        fetchOlder();
      } else {
        // loop mode with cooldown — requeue from earlier items
        console.log('Loop mode: requeuing older items with cooldown');
        const recent = new Set(excludeIds());
        const candidates: Post[] = [];
        for (const p of items) {
          if (!recent.has(p.id)) candidates.push(p);
          if (candidates.length >= PAGE_SIZE) break;
        }
        // last resort if tiny dataset
        let i = 0;
        while (candidates.length < PAGE_SIZE && i < items.length) candidates.push(items[i++]);
        console.log(`Adding ${candidates.length} items back to the end for infinite scroll`);
        setItems(prev => [...prev, ...candidates]);
      }
    }
  }, [items.length, hasMore, fetchOlder, items]);

  const onViewable = useCallback((index: number, postId: string) => {
    viewIndexRef.current = index;
    // remember seen (persist later in a throttle)
    rememberSeen(seenRef.current, postId);
    maybePrefetch();
  }, [maybePrefetch]);

  // ---------- fresh on open
  const resetAndLoadFresh = useCallback(async () => {
    console.log('resetAndLoadFresh: Loading fresh feed...');
    setItems([]); setError(null); setLoading(true); setHasMore(true);
    beforeRef.current = null;
    // load seen (let the system work naturally now)
    seenRef.current = await loadSeen();
    console.log(`Loaded ${seenRef.current.entries.length} seen items from storage`);
    
    // Force load some video posts for testing
    const videoTestQuery = await supabase
      .from('posts')
      .select(FEED_SELECT)
      .like('media_url', '%.mp4')
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (videoTestQuery.data && videoTestQuery.data.length > 0) {
      console.log(`[TEST] Found ${videoTestQuery.data.length} video posts for testing`);
      console.log(`[TEST] First video post:`, JSON.stringify(videoTestQuery.data[0], null, 2));
    }
    
    // Get mixed content - fresh images AND videos
    console.log('[FEED] Loading mixed content (fresh images + videos)');
    
    // Get fresh recent posts (last 24 hours) - these are likely images
    const recentQuery = supabase
      .from('posts')
      .select(FEED_SELECT)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(8);
      
    // Get some videos from the past week
    const videoQuery = supabase
      .from('posts')
      .select(FEED_SELECT)
      .like('media_url', '%.mp4')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(4);
    
    const [recentResult, videoResult] = await Promise.all([recentQuery, videoQuery]);
    
    console.log('[FEED] Recent posts result:', recentResult.error ? 'ERROR' : 'SUCCESS', 'count:', recentResult.data?.length);
    console.log('[FEED] Video posts result:', videoResult.error ? 'ERROR' : 'SUCCESS', 'count:', videoResult.data?.length);
    
    // Combine and shuffle the results
    const allPosts = [...(recentResult.data || []), ...(videoResult.data || [])];
    const uniqueById = new Map();
    allPosts.forEach(post => uniqueById.set(post.id, post));
    
    // Mix them up and sort by creation date for natural feed flow
    const rows = Array.from(uniqueById.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    console.log(`[FEED] Mixed feed: ${rows.length} total posts (${rows.filter(p => p.media_url?.includes('.mp4')).length} videos, ${rows.filter(p => !p.media_url?.includes('.mp4')).length} images/other)`);
    if (rows.length > 0) console.log('[FEED] Sample posts:', rows.slice(0,3).map(p => ({ id: p.id, type: p.media_url?.includes('.mp4') ? 'video' : 'image' })));
    
    console.log(`Fresh feed loaded with ${rows.length} posts`);
    if (rows.length > 0) console.log('First post data:', JSON.stringify(rows[0], null, 2));
    setItems(rows);
    if (!rows.length || rows.length < PAGE_SIZE) {
      setHasMore(false);
    } else {
      const last = rows[rows.length - 1]!;
      beforeRef.current = { created_at: last.created_at, id: last.id };
    }
    setLoading(false);
  }, []);

  // persist seen occasionally
  useEffect(() => {
    const t = setInterval(() => { 
      if (seenRef.current.entries.length > 0) {
        saveSeen(seenRef.current); 
        console.log(`Persisted ${seenRef.current.entries.length} seen items`);
      }
    }, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { 
    resetAndLoadFresh(); 
  }, [resetAndLoadFresh]);

  return { items, loading, refreshing, error, onViewable, refreshNewer, resetAndLoadFresh };
}