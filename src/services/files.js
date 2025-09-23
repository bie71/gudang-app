import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const DOWNLOAD_PREF_FILE = `${FileSystem.documentDirectory}po_download_dir.json`;

function describeSafDirectory(directoryUri) {
  if (!directoryUri) return null;
  try {
    let descriptor = directoryUri;
    const treeMarker = "/tree/";
    const treeIndex = descriptor.indexOf(treeMarker);
    if (treeIndex >= 0) {
      descriptor = descriptor.substring(treeIndex + treeMarker.length);
    }
    const documentMarker = "/document/";
    const documentIndex = descriptor.indexOf(documentMarker);
    if (documentIndex >= 0) {
      descriptor = descriptor.substring(0, documentIndex);
    }
    let decoded = decodeURIComponent(descriptor);
    if (!decoded) return null;
    if (decoded.startsWith("primary:")) {
      const relative = decoded.substring("primary:".length).replace(/:/g, "/");
      return relative ? `Penyimpanan internal/${relative}` : "Penyimpanan internal";
    }
    if (decoded.startsWith("home:")) {
      const relative = decoded.substring("home:".length).replace(/:/g, "/");
      return relative ? `Folder beranda/${relative}` : "Folder beranda";
    }
    if (decoded.includes(":")) {
      const [volume, ...restParts] = decoded.split(":");
      const rest = restParts.join(":").replace(/:/g, "/");
      return rest ? `${volume}/${rest}` : volume;
    }
    return decoded.replace(/:/g, "/");
  } catch (error) {
    console.log("DESCRIBE DIRECTORY ERROR:", error);
    return null;
  }
}

function buildExternalDisplayPath(directoryUri, fileName) {
  const baseLabel = describeSafDirectory(directoryUri);
  const sanitizedName = (fileName || "").replace(/^\/+/, "");
  const trimmedBase = baseLabel ? baseLabel.replace(/\/+$/, "") : null;
  if (trimmedBase) {
    const path = sanitizedName ? `${trimmedBase}/${sanitizedName}` : trimmedBase;
    return `Folder yang kamu pilih: ${path}`;
  }
  if (directoryUri) {
    const trimmedUri = directoryUri.replace(/\/+$/, "");
    const path = sanitizedName ? `${trimmedUri}/${sanitizedName}` : trimmedUri;
    return `Folder yang kamu pilih: ${path}`;
  }
  return null;
}

function buildInternalDisplayPath(fileName, destPath) {
  const sanitizedName = (fileName || "").replace(/^\/+/, "");
  if (FileSystem.documentDirectory) {
    const normalizedDir = FileSystem.documentDirectory.endsWith("/")
      ? FileSystem.documentDirectory
      : `${FileSystem.documentDirectory}/`;
    return `Folder aplikasi internal: ${normalizedDir}${sanitizedName}`;
  }
  if (destPath) {
    return `Folder aplikasi internal: ${destPath}`;
  }
  return "Folder aplikasi internal";
}

async function getSavedDownloadDir() {
  try {
    const content = await FileSystem.readAsStringAsync(DOWNLOAD_PREF_FILE);
    if (!content) return null;
    const parsed = JSON.parse(content);
    return parsed?.directoryUri || null;
  } catch (error) {
    return null;
  }
}

async function setSavedDownloadDir(directoryUri) {
  try {
    if (!directoryUri) {
      await FileSystem.deleteAsync(DOWNLOAD_PREF_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(DOWNLOAD_PREF_FILE, JSON.stringify({ directoryUri }));
  } catch (error) {
    console.log("SAVE PREF ERROR:", error);
  }
}

export async function saveFileToStorage(tempUri, fileName, mimeType) {
  const copyToDocumentDirectory = async () => {
    if (!FileSystem.documentDirectory) {
      throw new Error("DOCUMENT_DIRECTORY_UNAVAILABLE");
    }
    const destPath = `${FileSystem.documentDirectory}${fileName}`;
    try {
      await FileSystem.deleteAsync(destPath, { idempotent: true });
    } catch (error) {
      if (error?.message) {
        console.log("DELETE TEMP FILE ERROR:", error);
      }
    }
    await FileSystem.copyAsync({ from: tempUri, to: destPath });
    return {
      uri: destPath,
      displayPath: buildInternalDisplayPath(fileName, destPath),
    };
  };

  const hasSAF =
    Platform.OS === "android" &&
    FileSystem.StorageAccessFramework &&
    typeof FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync === "function";

  if (hasSAF) {
    let directoryUri = await getSavedDownloadDir();
    if (!directoryUri) {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          directoryUri = permissions.directoryUri;
          await setSavedDownloadDir(directoryUri);
        } else {
          const fallback = await copyToDocumentDirectory();
          return {
            uri: fallback.uri,
            location: "internal",
            notice: "Perangkat tidak mengizinkan memilih folder penyimpanan eksternal.",
            displayPath: fallback.displayPath,
          };
        }
      } catch (permissionError) {
        console.log("SAF PERMISSION ERROR:", permissionError);
        const fallback = await copyToDocumentDirectory();
        return {
          uri: fallback.uri,
          location: "internal",
          notice: "Gagal membuka pemilih folder. File disimpan di folder aplikasi.",
          displayPath: fallback.displayPath,
        };
      }
    }

    if (directoryUri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, mimeType);
        await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return {
          uri: destUri,
          location: "external",
          notice: null,
          displayPath: buildExternalDisplayPath(directoryUri, fileName),
        };
      } catch (saveError) {
        console.log("SAF SAVE ERROR:", saveError);
        await setSavedDownloadDir(null);
        const fallback = await copyToDocumentDirectory();
        return {
          uri: fallback.uri,
          location: "internal",
          notice: "Tidak dapat menyimpan ke folder yang dipilih. File disimpan di folder aplikasi.",
          displayPath: fallback.displayPath,
        };
      }
    }
  }

  try {
    const fallback = await copyToDocumentDirectory();
    return {
      uri: fallback.uri,
      location: "internal",
      notice:
        Platform.OS === "android" && !hasSAF
          ? "Perangkat tidak mendukung pemilihan folder eksternal. File disimpan di folder aplikasi."
          : null,
      displayPath: fallback.displayPath,
    };
  } catch (error) {
    console.log("SAVE FILE ERROR:", error);
    return {
      uri: tempUri,
      location: "unknown",
      notice: "Gagal memindahkan file ke folder aplikasi.",
      displayPath: tempUri ? `Lokasi sementara: ${tempUri}` : null,
    };
  }
}

export async function resolveShareableUri(fileName, ...candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    if (candidate.startsWith("file://")) return candidate;
    if (candidate.startsWith("/")) return `file://${candidate}`;
  }

  const contentCandidate = candidates.find(uri => typeof uri === "string" && uri.startsWith("content://"));
  if (
    contentCandidate &&
    FileSystem.StorageAccessFramework &&
    typeof FileSystem.StorageAccessFramework.readAsStringAsync === "function"
  ) {
    try {
      const base64 = await FileSystem.StorageAccessFramework.readAsStringAsync(contentCandidate, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!cacheRoot) return null;
      const sharePath = `${cacheRoot}${fileName}`;
      await FileSystem.writeAsStringAsync(sharePath, base64, { encoding: FileSystem.EncodingType.Base64 });
      return sharePath;
    } catch (error) {
      console.log("CONTENT SHARE ERROR:", error);
    }
  }

  return null;
}
