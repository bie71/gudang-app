# Gudang App (React Native + Expo + SQLite) - v1.8.0

Aplikasi manajemen pergudangan, stok barang, purchase order, dan pembukuan kas toko berbasis **offline-first** dengan arsitektur **Clean Code**, **Micro UI**, **Real-Time Cross-Screen Reactivity**, serta integrasi pencadangan awan **Google Drive (Two-Way Sync)**.

---

## ✨ Fitur Unggulan

### 1. 🏗️ Arsitektur Clean Code & Micro UI (v1.8.0)
- **Separation of Concerns (SoC):** Pemisahan tegas antara logika bisnis (Business Logic), akses data (Repository Pattern), status/state management (Custom Hooks), dan presentasi visual (Micro UI Components).
- **Micro UI Toolkit (`src/components/ui`):** Kumpulan komponen atomik yang konsisten, reusable, dan modular (`Card`, `Badge`, `SearchBar`, `EmptyState`, `FilterChip`, `ConfirmModal`, `SectionHeader`, `Header`).
- **Data Access Layer (`src/repositories`):** Seluruh query SQLite diisolasi ke dalam repository (`itemRepository`, `purchaseOrderRepository`, `bookkeepingRepository`, `dashboardRepository`, `masterDataRepository`, `analyticsRepository`, `calculatorRepository`).
- **Reactive Hooks Layer (`src/hooks`):** Pengelolaan state dan efek samping terpusat (`useItems`, `useItemDetail`, `usePurchaseOrders`, `usePurchaseOrderDetail`, `useBookkeeping`, `useDashboard`, `useMasterData`).

### 2. ⚡ Reaktivitas Instan Seluruh Modul (Real-Time Event Bus)
- **Centralized Event Bus (`src/services/events.js`):** Mekanisme pub/sub in-memory ringan yang memancarkan event perubahan data (`PO_CHANGED`, `ITEMS_CHANGED`, `BOOKKEEPING_CHANGED`).
- **Focus Reactivity (`useFocusEffect`):** Setiap kali kembali ke layar detail, daftar, atau dashboard setelah melakukan edit/tambah data, tampilan langsung ter-update secara otomatis tanpa reload kasar dan tanpa harus kembali ke list terlebih dahulu.
- **Optimistic UI Updates:** Respon antarmuka instan (0 milidetik) saat mengubah status, membatalkan pesanan, atau menghapus item, dengan proteksi rollback otomatis jika terjadi kesalahan.

### 3. 📦 Purchase Order (PO) & Invoice Pintar
- **Pelacakan Status Lengkap:** Pemantauan status PO secara visual (`PROGRESS`, `DONE`, `CANCELLED`).
- **Fitur Batalkan PO (Cancel PO):** Tombol pembatalan langsung pada daftar kartu PO maupun layar detail PO lengkap dengan dialog konfirmasi.
- **Smart Autocomplete (Suggestion Chips):**
  - **Nama Pemesan / Pembeli:** Rekomendasi otomatis dari master data pelanggan.
  - **Nama Supplier / Pemasok:** Rekomendasi otomatis dari riwayat pemasok unik yang pernah dicatat.
  - **Nama Marketer & Komisi:** Rekomendasi marketer otomatis yang sekaligus mengisi tarif komisi standar (`default_fee`).
  - **Nama Barang PO:** Rekomendasi nama barang yang otomatis mengisi harga jual dan harga modal, serta menghitung proyeksi profit per baris barang.
- **Akumulasi Profit Bersih & Estimasi Proyeksi:**
  - **Akumulasi Profit Bersih (Selesai):** Keuntungan riil dari pesanan berstatus `DONE` setelah dipotong biaya modal dan fee marketer.
  - **Estimasi Profit Berjalan (Progress):** Potensi laba dari pesanan yang sedang diproses.
  - **Total Belanja & Total Kuantitas Pesanan.**
- **Ekspor Dokumen Invoice Resmi:**
  - **Export PDF:** Pembuatan struk faktur/invoice PO profesional format PDF via `expo-print` dan berbagi via `expo-sharing`.
  - **Export Gambar PNG:** Pengambilan tangkapan gambar faktur beresolusi tinggi via `react-native-view-shot` untuk dibagikan ke WhatsApp atau media sosial.

### 4. 📊 Dashboard Manajemen & Quick Menu Pintas
- **Header Bersih & Proporsional:** Tata letak minimalis dengan 2 aksi esensial (Lonceng Notifikasi & Ikon Pengaturan Data/Backup).
- **Pintasan Menu Operasional (`DashboardQuickMenu`):**
  - ☁️ **Backup & Sync:** Akses cepat ke pencadangan Google Drive dan pemeliharaan database.
  - 👥 **Master Data:** Pengaturan daftar pemesan, marketer, dan item barang PO.
  - ⏱️ **Riwayat Stok:** Log audit pergerakan keluar-masuk barang.
  - 📊 **Laporan Bisnis:** Analitik margin laba riil dan konsultasi strategi bisnis.
- **Metrik Utama Real-Time:** Total stok fisik, valuasi inventaris toko, status PO berjalan, saldo kas toko, dan banner akumulasi laba bersih PO.

### 5. ☁️ Google Drive Backup & Two-Way Sync
- **Pencadangan Penuh ke Cloud:** Otentikasi OAuth2 resmi Google Drive untuk mengunggah dan memulihkan cadangan database JSON secara aman.
- **Sinkronisasi 2-Arah:** Kemampuan sinkronisasi antar perangkat menggunakan akun Google Drive yang sama.
- **Optimasi Database (VACUUM):** Fitur pembersihan soft-deleted data lama (>30 hari) dan kompresi database lokal.

### 6. 🗃️ Manajemen Inventori, Stok & Pembukuan Kas
- **Inventori & Stok Visual:** CRUD barang, level stok visual dinamis (Aman, Menipis, Kritis, Habis), dan pencatatan stok masuk (IN) / keluar (OUT).
- **Pembukuan Keuangan Toko:** Buku kas masuk/keluar harian beserta riwayat akun dan saldo kumulatif.
- **Kalkulator Biaya (HPP):** Simulasi harga pokok penjualan dengan perhitungan ongkir dan margin keuntungan.
- **Asisten AI Consultant:** Analisis rasio margin laba bersih offline dari penjualan riil.
- **Sistem Notifikasi Pintar:** Peringatan H-1 PO jatuh tempo / barang ready, peringatan stok habis (`0 pcs`), dan rekapitulasi keuangan bulanan.

---

## 🧰 Kebutuhan Lingkungan (Prerequisites)
- **Node.js** LTS (v18+ atau v20+)
- **npm** atau **yarn**
- **Expo CLI** (`npx expo`)
- **Android Studio** (Emulator) atau Perangkat Android fisik dengan **Expo Go** / Development Build

---

## 🚀 Setup & Menjalankan Aplikasi

1. **Install Dependensi:**
   ```bash
   npm install
   ```

2. **Jalankan Development Server:**
   ```bash
   npx expo start
   ```
   *Tekan `a` pada terminal untuk membuka di Android Emulator, atau pindai kode QR menggunakan aplikasi Expo Go di HP.*

3. **Verifikasi Kompilasi (Export Bundling):**
   ```bash
   npx expo export --platform android
   ```

---

## 📂 Struktur Direktori Proyek

```
gudang-app/
├── assets/                 # Aset gambar, ikon, dan splash screen
├── src/
│   ├── components/         # Komponen form dasar & UI reusable
│   │   └── ui/             # Micro UI Design System (Badge, Card, SearchBar, dll)
│   ├── hooks/              # Custom React Hooks (useItems, usePurchaseOrders, dll)
│   ├── navigation/         # Navigasi Root Stack & Bottom Tabs
│   ├── repositories/       # Data Access Layer & SQLite Queries
│   ├── screens/            # Layar Antarmuka Pengguna
│   │   ├── Items/          # Inventori & Mutasi Stok
│   │   ├── bookkeeping/    # Pembukuan & Arus Kas
│   │   ├── dashboard/      # Dashboard, Metrik & Quick Menu
│   │   └── purchaseOrders/ # Purchase Orders, Invoice PDF/PNG & Autocomplete
│   ├── services/           # Database SQLite, Backup, File Sharing & Event Bus
│   └── utils/              # Formatter mata uang, tanggal, dan sanitasi data
├── app.json                # Konfigurasi Expo & Metadata Aplikasi (v1.8.0)
├── package.json            # Daftar dependensi & scripts
└── README.md               # Dokumentasi Lengkap Proyek
```

---

## 📱 Build Aplikasi (Android & iOS)

### Menggunakan EAS Build (Cloud) - *Direkomendasikan*
```bash
# 1. Login ke akun Expo
npx eas login

# 2. Build APK untuk pengujian langsung di HP
npx eas build -p android --profile development

# 3. Build AAB untuk Google Play Store
npx eas build -p android --profile production
```

### Build Lokal (Android APK)
```bash
npx expo run:android --variant release
```

---

## 📄 Lisensi
Hak Cipta © 2026 BukuToko / Gudang App. Didistribusikan di bawah lisensi MIT.
