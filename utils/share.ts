import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

// Configure this: set in app.config.ts → extra.PUBLIC_BASE_URL or use a constant
const BASE = process.env.EXPO_PUBLIC_BASE_URL ?? 'https://vroom.app';

export function getShareUrl(post: { id: string; share_url?: string | null }) {
  // Prefer server-provided share_url; else web deep link
  if (post.share_url && String(post.share_url)) {
    return String(post.share_url);
  }
  
  // Create a universal link that works in browsers and opens the app if installed
  // The link should go to a web page that can handle the redirect
  return `${BASE}/post/${post.id}`;
}

export function getGroupShareUrl(group: { id: string; share_url?: string | null }) {
  if (group.share_url && String(group.share_url)) {
    return String(group.share_url);
  }
  
  return `${BASE}/group/${group.id}`;
}

export function getForumPostShareUrl(post: { id: string; share_url?: string | null }) {
  if (post.share_url && String(post.share_url)) {
    return String(post.share_url);
  }
  
  return `${BASE}/forum/${post.id}`;
}

export async function sharePost(post: { id: string; share_url?: string | null; title?: string }) {
  try {
    const url = getShareUrl(post);
    const title = post?.title || 'Check this out on Vroom';
    // iOS honors the url field; Android likes it inside message as well
    const payload: any = Platform.select({
      ios: { title, url },
      android: { title, message: `${title}\n${url}`, url },
      default: { title, message: `${title}\n${url}` },
    });
    const result = await Share.share(payload);
    return result;
  } catch (err) {
    // Fallback: copy to clipboard so the user can paste
    const url = getShareUrl(post);
    await Clipboard.setStringAsync(url);
    // Optionally surface a toast in the caller
    throw err;
  }
}

export async function shareGroup(group: { id: string; share_url?: string | null; name?: string }) {
  try {
    const url = getGroupShareUrl(group);
    const title = group?.name ? `Join ${group.name} on Vroom` : 'Check out this group on Vroom';
    const payload: any = Platform.select({
      ios: { title, url },
      android: { title, message: `${title}\n${url}`, url },
      default: { title, message: `${title}\n${url}` },
    });
    const result = await Share.share(payload);
    return result;
  } catch (err) {
    const url = getGroupShareUrl(group);
    await Clipboard.setStringAsync(url);
    throw err;
  }
}

export async function shareForumPost(post: { id: string; share_url?: string | null; title?: string }) {
  try {
    const url = getForumPostShareUrl(post);
    const title = post?.title || 'Check out this forum post on Vroom';
    const payload: any = Platform.select({
      ios: { title, url },
      android: { title, message: `${title}\n${url}`, url },
      default: { title, message: `${title}\n${url}` },
    });
    const result = await Share.share(payload);
    return result;
  } catch (err) {
    const url = getForumPostShareUrl(post);
    await Clipboard.setStringAsync(url);
    throw err;
  }
}