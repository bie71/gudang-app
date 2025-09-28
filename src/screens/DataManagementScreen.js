import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { makeRedirectUri } from 'expo-auth-session';

import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";

import { exportDatabaseBackup, importDatabaseBackup, getBackupJson } from "../services/backup";
import { exportAllDataCsv } from "../services/export";
import {
  clearDriveToken,
  getStoredDriveToken,
  isDriveTokenValid,
  saveDriveToken,
  uploadBackupToDrive,
} from "../services/googleDrive";
import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();

export default function DataManagementScreen({ navigation }) {
  const [csvExporting, setCsvExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [driveSyncing, setDriveSyncing] = useState(false);
  const [driveToken, setDriveToken] = useState(null);
  const [initialTokenLoading, setInitialTokenLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  const extraClients = useMemo(() => {
    const expoExtra = Constants?.expoConfig?.extra ?? {};
    const legacyExtra = Constants?.manifest?.extra ?? {};
    return expoExtra.googleClientIds || legacyExtra.googleClientIds || {};
  }, []);

  const googleConfig = useMemo(
    () => ({
      // expoClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_EXPO || extraClients.expo,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || extraClients.android,
      // iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || extraClients.ios,
      // webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || extraClients.web,
    }),
    [extraClients],
  );

  const hasGoogleConfig = useMemo(
    () =>
      Boolean(
        googleConfig.androidClientId ||
          googleConfig.iosClientId ||
          googleConfig.webClientId ||
          googleConfig.expoClientId,
      ),
    [googleConfig],
  );

  const ANDROID_ID_BASE = googleConfig.androidClientId.replace('.apps.googleusercontent.com', '');
  const GOOGLE_NATIVE_REDIRECT = `com.googleusercontent.apps.${ANDROID_ID_BASE}:/oauth2redirect/google`;

  const [request, , promptAsync] = Google.useAuthRequest({
    androidClientId: googleConfig.androidClientId,
    // iosClientId: googleConfig.iosClientId,
    // expoClientId: googleConfig.expoClientId,
    // webClientId: googleConfig.webClientId,
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file"],
    redirectUri: makeRedirectUri({ native: GOOGLE_NATIVE_REDIRECT }),
  });

useEffect(() => {
  console.log('AuthRequest redirectUri:', request?.redirectUri); 
  // Expected: com.googleusercontent.apps.<ID>:/oauth2redirect/google
}, [request]);

  useEffect(() => {
    (async () => {
      const stored = await getStoredDriveToken();
      if (stored) setDriveToken(stored);
      setInitialTokenLoading(false);
    })();
  }, []);

  const handleExportAllCsv = useCallback(async () => {
    if (csvExporting) return;
    setCsvExporting(true);
    try {
      const results = await exportAllDataCsv();
      const successList = results
        .filter(item => item.success)
        .map(item => `• ${item.label} → ${item.displayPath || item.uri || "tersimpan"}`);
      const failedList = results.filter(item => !item.success).map(item => `• ${item.label}`);
      const messageParts = [];
      if (successList.length) messageParts.push(`Berhasil:\n${successList.join("\n")}`);
      if (failedList.length) messageParts.push(`Gagal:\n${failedList.join("\n")}`);
      Alert.alert("Ekspor CSV", messageParts.join("\n\n") || "Proses selesai.");
    } catch (error) {
      console.log("EXPORT ALL CSV ERROR:", error);
      Alert.alert("Gagal", "Tidak dapat mengekspor CSV saat ini.");
    } finally {
      setCsvExporting(false);
    }
  }, [csvExporting]);

  const handleBackup = useCallback(async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const result = await exportDatabaseBackup();
      const locationMessage = result.displayPath
        ? `File tersimpan di ${result.displayPath}.`
        : result.location === "external"
        ? "File tersimpan di folder yang kamu pilih."
        : `File tersimpan di ${result.uri}.`;
      const alertMessage = result.notice ? `${result.notice}\n\n${locationMessage}` : locationMessage;
      Alert.alert("Backup Dibuat", alertMessage);
    } catch (error) {
      console.log("EXPORT BACKUP ERROR:", error);
      Alert.alert("Gagal", "Backup tidak dapat dibuat saat ini.");
    } finally {
      setBackingUp(false);
    }
  }, [backingUp]);

  const handleDriveLogin = useCallback(async () => {
    if (!hasGoogleConfig) {
      Alert.alert(
        "Konfigurasi Tidak Lengkap",
        "Setel EXPO_PUBLIC_GOOGLE_CLIENT_ID_* pada konfigurasi proyek sebelum login Google Drive.",
      );
      return;
    }
    if (!request) {
      Alert.alert("Sedang Menyiapkan", "Harap tunggu sebentar lalu coba lagi.");
      return;
    }
    try {
      setAuthLoading(true);
      // const useProxy = Constants?.executionEnvironment === "storeClient";
      // const result = await promptAsync({ useProxy, showInRecents: true });
      const result = await promptAsync({  showInRecents: true });
      console.log("GOOGLE DRIVE LOGIN result:", result);
      if (result?.type === "success" && result.authentication?.accessToken) {
        const expiresIn = result.authentication.expiresIn ?? 3600;
        const saved = await saveDriveToken({
          accessToken: result.authentication.accessToken,
          expiresAt: Date.now() + expiresIn * 1000,
        });
        setDriveToken(saved);
        Alert.alert("Berhasil", "Google Drive tersambung.");
      }
    } catch (error) {
      console.log("GOOGLE DRIVE LOGIN ERROR:", error);
      Alert.alert("Gagal", "Tidak dapat login ke Google Drive.");
    } finally {
      setAuthLoading(false);
    }
  }, [hasGoogleConfig, promptAsync, request]);

  const handleDriveLogout = useCallback(async () => {
    await clearDriveToken();
    setDriveToken(null);
    Alert.alert("Selesai", "Google Drive terputus.");
  }, []);

  const handleDriveBackup = useCallback(async () => {
    if (driveSyncing) return;
    if (!driveToken || !isDriveTokenValid(driveToken)) {
      Alert.alert("Login Diperlukan", "Silakan login Google Drive terlebih dahulu sebelum mengunggah backup.");
      return;
    }
    setDriveSyncing(true);
    try {
      const { fileName, json } = await getBackupJson();
      await uploadBackupToDrive({ accessToken: driveToken.accessToken, fileName, jsonContent: json });
      Alert.alert("Berhasil", "Backup tersimpan di Google Drive.");
    } catch (error) {
      console.log("UPLOAD DRIVE ERROR:", error);
      if (error?.status === 401) {
        await clearDriveToken();
        setDriveToken(null);
        Alert.alert("Token Kedaluwarsa", "Sesi Google Drive berakhir. Silakan login ulang dan coba lagi.");
      } else {
        Alert.alert("Gagal", error?.message || "Tidak dapat mengunggah backup ke Google Drive.");
      }
    } finally {
      setDriveSyncing(false);
    }
  }, [driveSyncing, driveToken]);

  const executeRestore = useCallback(
    async fileUri => {
      setRestoring(true);
      try {
        await importDatabaseBackup(fileUri);
        Alert.alert(
          "Berhasil",
          "Data berhasil dipulihkan. Buka ulang aplikasi untuk memastikan perubahan diterapkan.",
          [
            {
              text: "OK",
              onPress: () => navigation.navigate("Tabs", { screen: "Dashboard" }),
            },
          ],
        );
      } catch (error) {
        console.log("IMPORT BACKUP ERROR:", error);
        Alert.alert("Gagal", error?.message || "Backup tidak dapat dipulihkan.");
      } finally {
        setRestoring(false);
      }
    },
    [navigation],
  );

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        type: ["application/json", "application/octet-stream", "text/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert("Gagal", "File tidak valid.");
        return;
      }
      Alert.alert(
        "Pulihkan Data?",
        "Seluruh data saat ini akan diganti dengan data dari backup. Pastikan kamu sudah membuat backup terbaru sebelum melanjutkan.",
        [
          { text: "Batal", style: "cancel" },
          {
            text: "Pulihkan",
            style: "destructive",
            onPress: () => executeRestore(asset.uri),
          },
        ],
      );
    } catch (error) {
      console.log("DOCUMENT PICKER ERROR:", error);
      Alert.alert("Gagal", "Tidak dapat memilih file backup.");
    }
  }, [executeRestore, restoring]);

  const Button = ({ icon, label, subtitle, color, loading, onPress, disabled }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
        opacity: disabled || loading ? 0.6 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: color,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 14,
          }}
        >
          <Ionicons name={icon} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>{label}</Text>
          {subtitle ? <Text style={{ color: "#64748B", marginTop: 4 }}>{subtitle}</Text> : null}
        </View>
      </View>
      {loading ? <ActivityIndicator color="#2563EB" /> : <Ionicons name="chevron-forward" size={20} color="#94A3B8" />}
    </TouchableOpacity>
  );

  const googleLoggedIn = Boolean(driveToken && isDriveTokenValid(driveToken));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", marginTop: -50}}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: "#0F172A", marginBottom: 6 }}>Manajemen Data</Text>
        <Text style={{ color: "#64748B", marginBottom: 20 }}>
          Ekspor CSV per modul, lakukan backup penuh, atau sinkronkan backup ke Google Drive.
        </Text>

        <Button
          icon="document-outline"
          label="Ekspor Semua CSV"
          subtitle="Menyimpan CSV untuk barang, riwayat stok, purchase order, dan pembukuan."
          color="#2563EB"
          onPress={handleExportAllCsv}
          loading={csvExporting}
          disabled={backingUp || restoring || driveSyncing}
        />

        <Button
          icon="cloud-download-outline"
          label="Backup Database"
          subtitle="Simpan seluruh data dalam satu file backup JSON."
          color="#0EA5E9"
          onPress={handleBackup}
          loading={backingUp}
          disabled={csvExporting || restoring || driveSyncing}
        />

        <Button
          icon="cloud-upload-outline"
          label="Pulihkan dari Backup"
          subtitle="Ganti data aplikasi dengan file backup yang dipilih."
          color="#F97316"
          onPress={handleRestore}
          loading={restoring}
          disabled={csvExporting || backingUp || driveSyncing}
        />

        <View style={{ marginVertical: 8 }} />

        <Button
          icon={googleLoggedIn ? "log-out-outline" : "logo-google"}
          label={googleLoggedIn ? "Keluar Google Drive" : "Login Google Drive"}
          subtitle={googleLoggedIn ? "Google Drive tersambung. Kamu dapat mengunggah backup langsung." : "Masuk dengan akun Google untuk menyimpan backup ke Google Drive."}
          color="#EA4335"
          onPress={googleLoggedIn ? handleDriveLogout : handleDriveLogin}
          loading={authLoading || initialTokenLoading}
          disabled={!hasGoogleConfig || driveSyncing}
        />

        <Button
          icon="cloud-outline"
          label="Backup ke Google Drive"
          subtitle="Unggah file backup JSON ke Google Drive (memerlukan login)."
          color="#34A853"
          onPress={handleDriveBackup}
          loading={driveSyncing}
          disabled={!googleLoggedIn || driveSyncing || authLoading || initialTokenLoading}
        />

        <View style={{ marginTop: 24, backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
          <Text style={{ fontWeight: "700", color: "#0F172A", marginBottom: 8 }}>Tips</Text>
          <Text style={{ color: "#64748B", marginBottom: 6 }}>
            • Lakukan backup sebelum mengganti perangkat atau melakukan restore.
          </Text>
          <Text style={{ color: "#64748B", marginBottom: 6 }}>
            • Simpan file backup di cloud storage pribadi agar mudah dipindahkan ke perangkat lain.
          </Text>
          <Text style={{ color: "#64748B", marginBottom: 6 }}>
            • Setelah restore selesai, buka ulang aplikasi agar seluruh tab memuat data terbaru.
          </Text>
          <Text style={{ color: "#64748B" }}>
            • Untuk sinkron Google Drive, setel variabel EXPO_PUBLIC_GOOGLE_CLIENT_ID_* lalu login terlebih dahulu.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
