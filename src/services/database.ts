import Database from '@tauri-apps/plugin-sql';
import type { Item } from '../types/Item';
import { BaseDirectory, exists, mkdir, readFile, writeFile, remove } from '@tauri-apps/plugin-fs';
import dotenv from "dotenv";

dotenv.config();
let db: Database | null = null;
let isSyncing = false;
const SYNC_INTERVAL_MS = 30 * 1000;
export const VPS_URL = process.env.VPS_URL;

export async function initDatabase() {
  if (db) return db;

  db = await Database.load('sqlite:lostfound.db');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      contact TEXT NOT NULL,
      solved INTEGER DEFAULT 0,
      image TEXT,
      item_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database initialized');
  return db;
}

export async function getFoundItems(): Promise<Item[]> {
  const database = await initDatabase();
  return database.select<Item[]>(
    "SELECT * FROM items WHERE status = 'found' ORDER BY created_at DESC"
  );
}

export async function getLostItems(): Promise<Item[]> {
  const database = await initDatabase();
  return database.select<Item[]>(
    "SELECT * FROM items WHERE status = 'lost' ORDER BY created_at DESC"
  );
}

export async function getAllItems(): Promise<Item[]> {
  const database = await initDatabase();
  return database.select<Item[]>(
    "SELECT * FROM items ORDER BY created_at DESC"
  );
}

export async function addItem(item: Omit<Item, 'id' | 'created_at'>): Promise<void> {
  const database = await initDatabase();
  const id = crypto.randomUUID();

  await database.execute(
    `INSERT INTO items (id, name, status, type, location, description, contact, solved, image, item_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, item.name, item.status, item.type, item.location, item.description, item.contact, item.solved ? 1 : 0, item.image, item.item_code ?? null]
  );

  console.log('Item added successfully:', id);
}

export async function updateItemSolvedStatus(id: string, solved: boolean): Promise<void> {
  const database = await initDatabase();
  console.log(`Setting item ${id} to ${solved}`);
  await database.execute(
    `UPDATE items SET solved = $1 WHERE id = $2`,
    [solved ? 1 : 0, id]
  );
}

export async function getItemById(id: string): Promise<Item | null> {
  const database = await initDatabase();
  const results = await database.select<Item[]>("SELECT * FROM items WHERE id = $1", [id]);
  return results.length > 0 ? results[0] : null;
}

export async function updateItem(item: Item): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    `UPDATE items 
     SET name        = $1,
         type        = $2,
         location    = $3,
         description = $4,
         contact     = $5,
         status      = $6,
         solved      = $7,
         image       = $8,
         item_code   = $9
     WHERE id = $10`,
    [
      item.name,
      item.type,
      item.location,
      item.description,
      item.contact,
      item.status,
      item.solved ? 1 : 0,
      item.image,
      item.item_code ?? null,
      item.id,
    ]
  );
}

export async function addItemWithId(item: Item): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    `INSERT INTO items (id, name, status, type, location, description, contact, solved, image, item_code, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      item.id,
      item.name,
      item.status,
      item.type,
      item.location,
      item.description,
      item.contact,
      item.solved ? 1 : 0,
      item.image,
      item.item_code ?? null,
      item.created_at,
    ]
  );
}

export async function registerItemWithServer(
  item: Omit<Item, 'id' | 'created_at'>,
  imageBlob?: Uint8Array,
  imagePath?: string
): Promise<string> {
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  const fullItem: Item = { ...item, id, created_at };

  const formData = new FormData();
  formData.append('item', JSON.stringify(fullItem));

  if (imageBlob && imageBlob.length > 0 && imagePath) {
    const filename = imagePath.split('/').pop() ?? 'image.jpg';
    formData.append('image', new Blob([imageBlob.buffer.slice(0) as ArrayBuffer], { type: 'image/jpeg' }), filename);
    formData.append('imagePath', imagePath);
  }

  const res = await fetch(`${VPS_URL}/register-item`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Server registration failed (${res.status}): ${body}`);
  }

  const { itemCode } = await res.json();

  await addItemWithId({ ...fullItem, image: imagePath ?? item.image, item_code: itemCode });

  return itemCode as string;
}

async function ensureDir(filepath: string) {
  const dir = filepath.substring(0, filepath.lastIndexOf('/'));
  const folderExist = await exists(dir, {
    baseDir: BaseDirectory.AppData,
  });

  if (!folderExist) {
    await mkdir(dir, {
      baseDir: BaseDirectory.AppData,
    });
  }
}

export async function syncWithServer(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    console.log('🔄 Starting simplified sync...');

    const localItems = await getAllItems();
    for (const item of localItems) {
      let dbImagePath = item.image;

      if (dbImagePath && !dbImagePath.startsWith('http')) {
        const localFullPath = dbImagePath;
        await ensureDir(localFullPath);

        if (await exists(localFullPath, { baseDir: BaseDirectory.AppData })) {
          const binary = await readFile(localFullPath, { baseDir: BaseDirectory.AppData });
          const formData = new FormData();
          const filename = dbImagePath.split('/').pop() || dbImagePath;
          formData.append('item', JSON.stringify(item));
          formData.append('imagePath', dbImagePath);
          formData.append('image', new Blob([binary]), filename);

          await fetch(`${VPS_URL}/sync`, { method: 'POST', body: formData });
        }
      } else {
        const formData = new FormData();
        formData.append('item', JSON.stringify(item));
        await fetch(`${VPS_URL}/sync`, { method: 'POST', body: formData });
      }
    }

    const lastSync = localStorage.getItem('inventory_last_sync');
    const pullRes = await fetch(`${VPS_URL}/sync-pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastSync }),
    });

    if (!pullRes.ok) throw new Error('Pull failed');
    const { remoteItems } = await pullRes.json();

    for (const remote of remoteItems) {
      if (remote.image) {
        try {
          const url = new URL(remote.image, VPS_URL);

          if (
            remote.image.startsWith('lost_images/') ||
            remote.image.startsWith('found_images/')
          ) {
            if (!(await exists(remote.image, { baseDir: BaseDirectory.AppData }))) {
              const imageUrl = url.href;
              const res = await fetch(imageUrl);
              if (res.ok) {
                const arrayBuffer = await res.arrayBuffer();
                await writeFile(remote.image, new Uint8Array(arrayBuffer), { baseDir: BaseDirectory.AppData });
              }
            }
          }
        } catch (e) {
          console.warn('Invalid image URL:', remote.image);
        }
      }

      const item: Item = {
        id: remote.id,
        name: remote.name,
        status: remote.status,
        type: remote.type,
        location: remote.location,
        description: remote.description,
        contact: remote.contact,
        solved: Boolean(remote.solved),
        image: remote.image || undefined,
        item_code: remote.item_code || undefined,
        created_at: remote.local_created_at || remote.created_at,
      };

      const existing = await getItemById(item.id);
      if (existing) {
        await updateItem(item);
      } else {
        await addItemWithId(item);
      }
    }

    localStorage.setItem('inventory_last_sync', new Date().toISOString());
    console.log('✅ Sync completed');
  } catch (error) {
    console.error('Sync error:', error);
  } finally {
    isSyncing = false;
  }
}

export function startAutoSync(): void {
  syncWithServer();
  setInterval(syncWithServer, SYNC_INTERVAL_MS);
}

export async function resetLocalData(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }

  await remove('lostfound.db', { baseDir: BaseDirectory.AppData });
  await remove('lost_images', { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
  await remove('found_images', { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});

  localStorage.removeItem('inventory_last_sync');

  console.log('🗑️ Local data wiped');
}