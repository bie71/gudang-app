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
# sinkron native kalau ada perubahan config
npx expo prebuild --platform android

# build AAB buat Play Store
eas build -p android --profile production

```


## 📦 Struktur Proyek
```
app/
  db/
    schema.sql
assets/
  icon.png
  splash.png
App.js
app.json
package.json
README.md
```

## ⚠️ Troubleshooting
- Emulator tidak terdeteksi → buka Android Studio > jalankan emulator > `npx expo start` > tekan `a`.
- Cache/metro error → stop server, hapus folder `.expo`, lalu `npx expo start -c`.
- Mismatch SDK → jalankan `npx expo-doctor` untuk cek versi.

## 🏗️ Build Produksi
- **EAS Build (disarankan)**: `npx eas build -p android` (perlu akun Expo).
- **Local debug**: `npx expo run:android` menghasilkan APK debug.

## 🛣️ Roadmap (opsional)
- Export CSV/PDF laporan
- Filter history per tanggal/kategori
- Backup/restore database
- Multi-gudang (kolom warehouse_id)

Lisensi: MIT
