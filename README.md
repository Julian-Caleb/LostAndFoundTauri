# Lost and Found (Comic Frontier / Comifuro)

Lost and Found Tauri is a Tauri desktop companion app (React + TypeScript) used together with a Flutter mobile app to collect and manage lost-and-found photos and item records for events. The codebase for the supporting mobile app is https://github.com/Julian-Caleb/LostAndFoundFlutter.

## Purpose

This project supports organizers and volunteers at Comic Frontier by providing an easy way to collect photos and item details from phones or webcams, store them locally, and synchronize items to a Contabo VPS for centralized access.

## Architecture and libraries

- Frontend: React + TypeScript (Vite) running inside a Tauri desktop shell.
- Local data: SQLite via tauri-plugin-sql for persistent storage.
- File operations: tauri-plugin-fs for storing images under AppData.
- Mobile uploads: a small TCP server in the Tauri backend (Rust) receives images from the Flutter mobile app.
- VPS: Contabo is used as the remote VPS for image hosting and sync endpoints.
- Mobile: Flutter mobile app (separate) used to capture and upload photos to the desktop app.

## Key features

- Add lost or found items via webcam capture.
- Add lost or found items via phone using QR-coded TCP upload.
- Local SQLite database of items with full CRUD operations.
- Automatic background sync to a remote VPS (Contabo) when available.
- Local image caching and fallback download if remote images are missing.
- Mark items as solved/unsolved and edit item details.
- Reset local data for development or recovery.

## How to use

1. Install and run the Tauri desktop app (see project run scripts).
2. On the homepage choose between Lost Items and Found Items.
3. Add items using "Webcam" (desktop camera) or "Phone" (scan QR with the Flutter mobile app).
4. For phone uploads, scan the QR code in the app to connect and upload an image.
5. Items are stored locally and periodically synchronized to the configured VPS.
6. Use the Reset Local Data button to wipe local data for testing.

## Development notes

- The Tauri backend exposes commands to start/stop a TCP image server and to receive images from phones.
- The app stores images under AppData (lost_images, found_images) and keeps image paths in SQLite.
- Configure the remote VPS URL via the environment or modify the VPS_URL constant in `src/services/database.ts`.