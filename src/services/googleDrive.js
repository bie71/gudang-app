import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "google_drive_token";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function now() {
  return Date.now();
}

function computeExpiry(expiresAt, expiresIn) {
  if (typeof expiresAt === "number") return expiresAt;
  if (typeof expiresIn === "number") return now() + expiresIn * 1000;
  return now() + 55 * 60 * 1000;
}

function sanitizeTokenPayload(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch (error) {
    console.log("GOOGLE DRIVE TOKEN PARSE ERROR:", error);
    return null;
  }
}

export async function getStoredDriveToken() {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return sanitizeTokenPayload(raw);
  } catch (error) {
    console.log("GOOGLE DRIVE TOKEN READ ERROR:", error);
    return null;
  }
}

export async function saveDriveToken({
  accessToken,
  expiresAt,
  expiresIn,
  idToken,
  refreshToken,
  scope,
  tokenType,
}) {
  if (!accessToken) return null;

  let existing = null;
  try {
    existing = sanitizeTokenPayload(await SecureStore.getItemAsync(TOKEN_KEY));
  } catch (error) {
    console.log("GOOGLE DRIVE TOKEN EXISTING READ ERROR:", error);
  }

  const payload = {
    ...existing,
    accessToken,
    expiresAt: computeExpiry(expiresAt, expiresIn),
    idToken: idToken ?? existing?.idToken ?? null,
    refreshToken: refreshToken ?? existing?.refreshToken ?? null,
    scope: scope ?? existing?.scope ?? null,
    tokenType: tokenType ?? existing?.tokenType ?? null,
  };

  try {
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(payload));
  } catch (error) {
    console.log("GOOGLE DRIVE TOKEN SAVE ERROR:", error);
  }

  return payload;
}

export async function clearDriveToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.log("GOOGLE DRIVE TOKEN CLEAR ERROR:", error);
  }
}

export function isDriveTokenValid(token) {
  if (!token?.accessToken || !token?.expiresAt) return false;
  const buffer = 60 * 1000; // 1 minute buffer
  return token.expiresAt - buffer > now();
}

export async function refreshDriveAccessToken({ clientId, refreshToken }) {
  if (!clientId) throw new Error("Google clientId tidak tersedia.");
  if (!refreshToken) throw new Error("Refresh token tidak tersedia.");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }).toString();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await response.json();

  if (!response.ok || !json?.access_token) {
    const error = new Error(json?.error_description || json?.error || "Gagal menyegarkan token Google Drive.");
    error.status = response.status;
    error.data = json;
    throw error;
  }

  return saveDriveToken({
    accessToken: json.access_token,
    expiresIn: json.expires_in,
    idToken: json.id_token,
    refreshToken,
    scope: json.scope,
    tokenType: json.token_type,
  });
}

export async function uploadBackupToDrive({ accessToken, fileName, jsonContent }) {
  if (!accessToken) throw new Error("Akses Google Drive tidak tersedia.");
  if (!fileName) throw new Error("Nama file backup tidak valid.");
  const boundary = `gd_boundary_${Math.random().toString(36).slice(2)}`;
  const metadata = {
    name: fileName,
    mimeType: "application/json",
  };
  const bodyParts = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    jsonContent,
    `--${boundary}--`,
    "",
  ];
  const body = bodyParts.join("\r\n");
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error("Tidak dapat mengunggah backup ke Google Drive.");
    error.status = response.status;
    error.body = text;
    throw error;
  }
  const data = await response.json();
  return data;
}
