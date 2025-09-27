import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "google_drive_token";

function now() {
  return Date.now();
}

export async function getStoredDriveToken() {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.expiresAt) return null;
    if (parsed.expiresAt <= now()) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.log("GOOGLE DRIVE TOKEN READ ERROR:", error);
    return null;
  }
}

export async function saveDriveToken({ accessToken, expiresAt }) {
  if (!accessToken) return;
  const payload = {
    accessToken,
    expiresAt: expiresAt || now() + 55 * 60 * 1000,
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
