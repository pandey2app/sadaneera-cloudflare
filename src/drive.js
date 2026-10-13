/**
 * Google Drive helpers for Sadaneera Mahotsav 2026.
 * Cloudflare Worker compatible; uses OAuth refresh-token credentials stored as secrets.
 */

// Keep a code fallback so a Git-based redeploy cannot lose the destination folder.
// Cloudflare's GOOGLE_DRIVE_FOLDER_ID secret takes precedence when configured.
const DEFAULT_DRIVE_FOLDER_ID = '15twVb9QClYV5hjIgijDDyMfyUYIKJ47I';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

function getFolderId(env) {
  const configured = String(env?.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  const folderId = configured || DEFAULT_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error('Google Drive destination folder is not configured. Set GOOGLE_DRIVE_FOLDER_ID.');
  }
  return folderId;
}

async function getAccessToken(env) {
  const clientId = env?.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = env?.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = env?.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Drive OAuth secrets are missing. Required: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${data.error_description || data.error || 'No access token returned'}`);
  }
  return data.access_token;
}

function concatBytes(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Upload an image into the configured Google Drive folder and return its Drive file ID. */
export async function uploadPhoto(photoBytes, filename, mimeType = 'image/jpeg', env) {
  if (!photoBytes || !photoBytes.length) throw new Error('Cannot upload an empty photo.');
  const folderId = getFolderId(env);
  const accessToken = await getAccessToken(env);
  const boundary = `sadaneera_${crypto.randomUUID().replace(/-/g, '')}`;
  const encoder = new TextEncoder();
  const metadata = {
    name: String(filename || `photo_${Date.now()}.jpg`),
    mimeType: mimeType || 'image/jpeg',
    parents: [folderId]
  };

  const body = concatBytes([
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${mimeType || 'image/jpeg'}\r\n\r\n`),
    photoBytes instanceof Uint8Array ? photoBytes : new Uint8Array(photoBytes),
    encoder.encode(`\r\n--${boundary}--`)
  ]);

  const response = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,parents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) {
    throw new Error(`Google Drive photo upload failed (${response.status}): ${data.error?.message || 'Drive did not return a file ID'}`);
  }
  return { fileId: data.id, name: data.name, mimeType: data.mimeType, parents: data.parents || [folderId] };
}

/** Stream a private Drive photo through the Worker without exposing OAuth credentials. */
export async function fetchPhotoResponse(fileId, env) {
  if (!fileId || /[/?#]/.test(fileId)) {
    return new Response('Invalid Google Drive file ID', { status: 400 });
  }
  try {
    const accessToken = await getAccessToken(env);
    const response = await fetch(`${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return new Response(`Unable to fetch photo from Google Drive (${response.status}). ${detail.slice(0, 300)}`, {
        status: response.status === 404 ? 404 : 502,
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=3600');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return new Response(`Unable to fetch Google Drive photo: ${error?.message || 'Unknown error'}`, {
      status: 502,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/** Delete a Drive photo. Returns true only when Drive confirms deletion. */
export async function deletePhoto(fileId, env) {
  if (!fileId) return false;
  try {
    const accessToken = await getAccessToken(env);
    const response = await fetch(`${DRIVE_API}/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    // Drive API returns 204 for successful deletion. A 404 means it is already absent.
    return response.ok || response.status === 404;
  } catch (error) {
    console.error('Google Drive photo deletion failed:', error?.message || error);
    return false;
  }
}
