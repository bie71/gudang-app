# Gudang App (React Native + Expo + SQLite)

Aplikasi gudang **offline-first** untuk input barang, stok masuk/keluar, riwayat transaksi, dan dashboard metrik.

## ✨ Fitur
- CRUD barang (nama, kategori, harga, stok)
- Stok **Masuk/IN** & **Keluar/OUT** + history
- Dashboard: **Total Barang**, **Total Stok**, **Total Omzet** (∑ OUT × harga)
- Desain modern + **splash screen**

## 🧰 Requirement
- **Node.js** LTS (18+/20+)
- **npm/pnpm/yarn**
- **Expo** (gunakan `npx expo` / Expo Go app)
- **Android Studio** (Emulator) atau HP Android dengan **Expo Go**
- (Opsional iOS) macOS + Xcode

> SQLite berjalan native di Android/iOS. Mode Web tidak direkomendasikan.

## 🚀 Setup & Instalasi
```bash
npm install
npx expo start
# tekan "a" untuk emulator Android atau scan QR di Expo Go
```

### Menjalankan langsung ke emulator/device
```bash
npx expo run:android
# atau
npx expo run:ios   # (butuh macOS + Xcode)
```

## 🗃️ Skema Database
Tabel yang digunakan oleh aplikasi (dibuat otomatis saat boot):
```sql
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stock_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  type TEXT NOT NULL,      -- 'IN' | 'OUT'
  qty INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(item_id) REFERENCES items(id)
);
```

**Aturan singkat**
- Tambah barang → opsional stok awal
- IN: insert history + `items.stock += qty`
- OUT: validasi stok, insert history + `items.stock -= qty`
- Omzet = Σ(OUT.qty × item.price)

```
## 📱 Panduan Menjalankan & Membangun Aplikasi (Run & Build Guide)

Berikut adalah panduan lengkap cara menjalankan aplikasi di emulator, debugging via ADB, serta langkah-langkah membangun (build) aplikasi untuk Android & iOS menggunakan Expo CLI dan EAS (Expo Application Services).

---

### 1. Menjalankan Aplikasi di Emulator (Run on Emulator)

#### Emulator Android (Android Studio / AVD)
1. **Buka Android Studio**, pilih **Device Manager** (AVD Manager), dan jalankan salah satu emulator Android pilihan Anda.
2. Pastikan emulator sudah menyala penuh dan terdeteksi.
3. Jalankan perintah di bawah ini pada terminal proyek Anda:
   ```bash
   npx expo start
   ```
4. Setelah Metro Bundler berjalan, tekan tombol **`a`** pada terminal untuk menginstalkan aplikasi dan membukanya di emulator Android secara otomatis.
   * *Alternatif (Langsung compile Native Build)*:
     ```bash
     npx expo run:android
     ```

#### Simulator iOS (Hanya macOS + Xcode)
1. Buka **Xcode** > **Open Developer Tool** > **Simulator**.
2. Jalankan Metro Bundler:
   ```bash
   npx expo start
   ```
3. Tekan tombol **`i`** pada terminal untuk membuka aplikasi di simulator iOS.
   * *Alternatif (Langsung compile Native Build)*:
     ```bash
     npx expo run:ios
     ```

---

### 2. Debugging & Menjalankan via ADB (Android Debug Bridge)

Jika Anda ingin menjalankan aplikasi langsung ke HP/Device Android fisik atau mendeteksi emulator yang bermasalah menggunakan kabel USB:

#### Persiapan Device Fisik:
1. Aktifkan **Developer Options** di Android Anda (Klik *Build Number* sebanyak 7 kali di Pengaturan Sistem).
2. Nyalakan **USB Debugging** di menu Developer Options.
3. Hubungkan HP ke laptop/komputer Anda dengan kabel USB yang mendukung transfer data.

#### Perintah ADB Penting:
* **Mengecek perangkat yang terhubung**:
  ```bash
  adb devices
  ```
  *Pastikan perangkat Anda muncul dengan status `device`. Jika tertulis `unauthorized`, konfirmasi izin debugging pada layar HP Anda.*
* **Port Forwarding (Menghubungkan Metro Bundler ke HP Fisik)**:
  Jika HP terhubung via USB tetapi tidak bisa tersambung ke server Metro Bundler, jalankan:
  ```bash
  adb reverse tcp:8081 tcp:8081
  ```
* **Memasang file APK yang sudah dibuild secara lokal**:
  ```bash
  adb install -r path/to/your-app.apk
  ```
* **Melihat log system (debugging)**:
  ```bash
  adb logcat *:S ReactNative:V ReactNativeJS:V
  ```

---

### 3. Cara Membangun Aplikasi (Build untuk Android & iOS)

Terdapat dua metode untuk melakukan build: **EAS Build (Cloud)** dan **Local Build**.

#### A. Menggunakan EAS (Expo Application Services) - Rekomendasi 🌟
EAS Build melakukan proses kompilasi di server cloud Expo, sehingga Anda tidak membutuhkan laptop berspesifikasi tinggi (dan tidak butuh macOS untuk membuild iOS).

##### Persiapan:
1. Pastikan Anda sudah login ke akun Expo. Jika belum, jalankan:
   ```bash
   npx eas login
   ```
2. Inisialisasi konfigurasi EAS di proyek Anda (jika belum ada):
   ```bash
   npx eas build:configure
   ```

##### Membangun untuk Android:
* **Build APK (Development / Testing)**:
  Berguna untuk diinstal langsung ke perangkat testing (membuat file APK yang bisa dibagikan).
  ```bash
  npx eas build -p android --profile development
  ```
* **Build AAB (Production)**:
  Format `.aab` untuk diupload ke Google Play Store.
  ```bash
  npx eas build -p android --profile production
  ```

##### Membangun untuk iOS:
* **Build Simulator (Development)**:
  Membangun file `.app` untuk dijalankan di Simulator iOS.
  ```bash
  npx eas build -p ios --profile development
  ```
* **Build IPA (Production / TestFlight)**:
  Membangun file `.ipa` untuk rilis ke App Store (membutuhkan Apple Developer Account).
  ```bash
  npx eas build -p ios --profile production
  ```

---

#### B. Membangun Secara Lokal (Local Build)
Jika Anda tidak ingin menggunakan server cloud Expo dan ingin membuild langsung di komputer Anda (membutuhkan JDK, Android SDK diatur di environment path untuk Android, atau Xcode untuk iOS):

##### Membangun Android (Lokal):
1. Pastikan variabel lingkungan `ANDROID_HOME` dan JDK 17 telah diatur.
2. Jalankan perintah kompilasi lokal:
   ```bash
   npx expo run:android --variant release
   ```
   *Perintah ini akan menghasilkan file APK rilis di folder `android/app/build/outputs/apk/release/`.*

##### Membangun iOS (Lokal - Hanya macOS):
1. Pastikan Xcode dan CocoaPods sudah terinstal.
2. Jalankan perintah kompilasi lokal:
   ```bash
   npx expo run:ios --configuration Release
   ```

---

## 📦 Struktur Proyek
```
assets/        # Gambar aset (ikon, splash)
src/           # Folder Source Code
  components/  # Komponen UI Reusable
  navigation/  # Konfigurasi Navigator Stack/Tab
  screens/     # Halaman Aplikasi
  services/    # Integrasi Database & Ekspor
  utils/       # Fungsi pembantu & formatting
App.js         # Entry Point Aplikasi
app.json       # Konfigurasi Expo & App Metadata
package.json   # Dependensi & Scripts
README.md      # Dokumentasi Proyek
```

## ⚠️ Troubleshooting
- Emulator tidak terdeteksi → buka Android Studio > jalankan emulator > `npx expo start` > tekan `a`.
- Cache/metro error → stop server, hapus folder `.expo`, lalu `npx expo start -c`.
- Mismatch SDK → jalankan `npx expo-doctor` untuk cek versi.

Lisensi: MIT
