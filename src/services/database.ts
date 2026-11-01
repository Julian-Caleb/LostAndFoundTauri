import Database from '@tauri-apps/plugin-sql';
import type { Item } from '../types/Item';
import { BaseDirectory, exists, mkdir, readFile, writeFile, remove } from '@tauri-apps/plugin-fs';
import type { ItemType } from "../types/ItemType";
import { TYPE_CODES } from '../types/ItemCode';
let db: Database | null = null;

const TAG_RANGE_SIZE = 5;
const VITE_SYNC_URL: string = (import.meta.env.VITE_SYNC_URL ?? '').replace(/\/+$/, '');

// Initialize or open the local Sqlite database.
export async function initDatabase() {

  // await remove('', {
  //   baseDir: BaseDirectory.AppData,
  //   recursive: true,
  // });

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
      tag_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);

  // CREATE TABLE IF NOT EXISTS won't alter an existing table,
  // so add the column if this DB was created by an older version.
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(items)');
  if (!cols.some((c) => c.name === 'tag_id')) {
    await db.execute('ALTER TABLE items ADD COLUMN tag_id TEXT');
  }
  if (!cols.some((c) => c.name === 'updated_at')) {
    await db.execute('ALTER TABLE items ADD COLUMN updated_at TEXT');
  }
  await db.execute(
    `UPDATE items SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL`
  );

  // A duplicate tag can never be saved locally.
  await db.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_items_tag_id ON items(tag_id) WHERE tag_id IS NOT NULL'
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  console.log('Database initialized');
  return db;
}

// Serialize range consumption and reservation requests per type on this device.
const tagQueues = new Map<ItemType, Promise<unknown>>();

type TagRange = { next: number; end: number };

function enqueueTagJob<T>(type: ItemType, job: () => Promise<T>): Promise<T> {
  const result = (tagQueues.get(type) ?? Promise.resolve()).then(job);
  tagQueues.set(type, result.catch(() => {}));
  return result;
}

async function getAvailableTagRange(database: Database, key: string): Promise<TagRange | null> {
  const rows = await database.select<{ value: string }[]>(
    'SELECT value FROM meta WHERE key = $1',
    [key]
  );
  if (rows.length === 0) return null;

  const match = /^(\d+):(\d+)$/.exec(rows[0].value);
  if (!match) throw new Error(`Invalid saved tag range for ${key}`);
  const next = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(next) || !Number.isSafeInteger(end) || next < 0 || end < next - 1) {
    throw new Error(`Invalid saved tag range for ${key}`);
  }
  return next <= end ? { next, end } : null;
}

async function ensureTagRange(database: Database, type: ItemType): Promise<TagRange> {
  const code = TYPE_CODES[type];
  if (!code) throw new Error(`Unsupported item type: ${type}`);

  const key = `tag_range_${code}`;
  // Keep the current reservation across startup; only ask the server after all IDs are consumed.
  const existing = await getAvailableTagRange(database, key);
  if (existing) return existing;
  if (!VITE_SYNC_URL) throw new Error('Tag server URL is not configured');

  const response = await fetch(`${VITE_SYNC_URL}/tag-reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  if (!response.ok) {
    throw new Error(`Tag range reservation failed: ${response.status}`);
  }

  const payload: { code?: string; start?: number; end?: number } = await response.json();
  if (
    payload.code !== code ||
    typeof payload.start !== 'number' ||
    typeof payload.end !== 'number' ||
    !Number.isSafeInteger(payload.start) ||
    !Number.isSafeInteger(payload.end) ||
    payload.end - payload.start !== TAG_RANGE_SIZE - 1 ||
    payload.start < 0
  ) {
    throw new Error('Tag server returned an invalid reservation');
  }

  const range = { next: payload.start, end: payload.end };
  await database.execute(
    `INSERT INTO meta (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, `${range.next}:${range.end}`]
  );
  return range;
}

export function generateTagId(type: ItemType): Promise<string> {
  return enqueueTagJob(type, async () => {
    const database = await initDatabase();
    const code = TYPE_CODES[type];
    const range = await ensureTagRange(database, type);

    // Persist consumption before returning the tag so a restart cannot reuse it.
    await database.execute(
      'UPDATE meta SET value = $1 WHERE key = $2',
      [`${range.next + 1}:${range.end}`, `tag_range_${code}`]
    );
    return `${code}-${String(range.next).padStart(6, '0')}`;
  });
}

export async function prefetchTagRanges(): Promise<void> {
  const types = Object.keys(TYPE_CODES) as ItemType[];
  await Promise.all(types.map((type) =>
    enqueueTagJob(type, async () => {
      const database = await initDatabase();
      await ensureTagRange(database, type);
    }).catch((error) => {
      console.warn(`Could not prefetch tag range for ${type}`, error);
    })
  ));
}

// Return found items ordered by newest.
export async function getFoundItems(): Promise<Item[]> {
  const database = await initDatabase();
  return database.select<Item[]>(
    "SELECT * FROM items WHERE status = 'found' ORDER BY created_at DESC"
  );
}

// Return lost items ordered by newest.
export async function getLostItems(): Promise<Item[]> {
  const database = await initDatabase();
  return database.select<Item[]>(
    "SELECT * FROM items WHERE status = 'lost' ORDER BY created_at DESC"
  );
}

// Return all items ordered by newest.
export async function getAllItems(): Promise<Item[]> {
  const database = await initDatabase();
  return database.select<Item[]>(
    "SELECT * FROM items ORDER BY created_at DESC"
  );
}

// Insert new item into local database. Found items get a tag ID.
export async function addItem(
  item: Omit<Item, 'id' | 'created_at' | 'tag_id'>
): Promise<{ id: string; tag_id: string | null }> {
  const database = await initDatabase();
  const id = crypto.randomUUID();

  const tag_id =
    item.status === 'found' ? await generateTagId(item.type as ItemType) : null;

  await database.execute(
    `INSERT INTO items (id, name, status, type, location, description, contact, solved, image, tag_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, item.name, item.status, item.type, item.location, item.description, item.contact, item.solved ? 1 : 0, item.image, tag_id]
  );

  console.log('Item added successfully:', id, tag_id);
  return { id, tag_id };
}

// Update item's solved flag in database.
export async function updateItemSolvedStatus(id: string, solved: boolean): Promise<void> {
  const database = await initDatabase();
  console.log(`Setting item ${id} to ${solved}`);
  await database.execute(
    `UPDATE items SET solved = $1, updated_at = $2 WHERE id = $3`,
    [solved ? 1 : 0, new Date().toISOString(), id]
  );
}

// Retrieve single item by id.
export async function getItemById(id: string): Promise<Item | null> {
  const database = await initDatabase();
  const results = await database.select<Item[]>("SELECT * FROM items WHERE id = $1", [id]);
  return results.length > 0 ? results[0] : null;
}

// Update all fields of an existing item, including a regenerated tag ID.
export async function updateItem(item: Item, updatedAt = new Date().toISOString()): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    `UPDATE items 
    SET name = $1, 
        type = $2, 
        location = $3, 
        description = $4, 
        contact = $5, 
        status = $6, 
        solved = $7, 
        image = $8,
        tag_id = $9,
        updated_at = $10
    WHERE id = $11`,
    [
      item.name,
      item.type,
      item.location,
      item.description,
      item.contact,
      item.status,
      item.solved ? 1 : 0,
      item.image,
      item.tag_id ?? null,
      updatedAt,
      item.id,
    ]
  );
}

export async function deleteLocalImage(imagePath?: string | null): Promise<void> {
  if (!imagePath || imagePath.startsWith('http')) return;

  try {
    await remove(imagePath, { baseDir: BaseDirectory.AppData });
  } catch (error) {
    console.warn('Could not delete local image', imagePath, error);
  }
}

export async function deleteRemoteImage(imagePath?: string | null): Promise<void> {
  if (!imagePath || !VITE_SYNC_URL) return;

  let deleteTarget = imagePath;
  if (imagePath.startsWith('http')) {
    try {
      const url = new URL(imagePath);
      deleteTarget = url.pathname.replace(/^\/+/, '');
    } catch {
      return;
    }
  }

  try {
    const response = await fetch(`${VITE_SYNC_URL}/delete-image`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagePath: deleteTarget }),
    });

    if (!response.ok && response.status !== 404) {
      console.warn('Could not delete remote image', deleteTarget, response.status);
    }
  } catch (error) {
    console.warn('Could not reach remote delete-image endpoint', deleteTarget, error);
  }
}

// Insert item using provided id and timestamp.
export async function addItemWithId(item: Item): Promise<void> {
  const database = await initDatabase();
  const createdAt = item.created_at ?? item.updated_at ?? new Date().toISOString();
  await database.execute(
    `INSERT INTO items (id, name, status, type, location, description, contact, solved, image, tag_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
      item.tag_id ?? null,
      createdAt,
      item.updated_at ?? createdAt,
    ]
  );
}

let isSyncing = false;
const SYNC_INTERVAL_MS = 30 * 1000;

type RemoteItem = Omit<Item, 'solved'> & {
  solved: number | boolean;
  local_created_at?: string;
  created_at?: string;
  updated_at?: string;
};

// Ensure local image directory exists before writes.
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

function timestampValue(value?: string | null): number {
  if (!value) return 0;
  const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Sync local items and images with remote VPS.
export async function syncWithServer(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    console.log('🔄 Starting simplified sync...');
    const lastSync = localStorage.getItem('inventory_last_sync');
    const syncStartedAt = new Date().toISOString();
    const pullRes = await fetch(`${VITE_SYNC_URL}/sync-pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastSync }),
    });

    if (!pullRes.ok) throw new Error('Pull failed');
    const pullPayload: { remoteItems?: RemoteItem[] } = await pullRes.json();
    if (!Array.isArray(pullPayload.remoteItems)) {
      throw new Error('Pull response did not contain remoteItems');
    }

    const localItems = await getAllItems();
    const localById = new Map(
      localItems.map((item): [string, Item] => [item.id, item])
    );
    const remoteIds = new Set<string>();
    const itemsToPush = new Map<string, Item>();
    let remoteSaveFailed = false;

    for (const remote of pullPayload.remoteItems) {
      remoteIds.add(remote.id);
      const existing = localById.get(remote.id);
      const createdAt = remote.local_created_at
        || remote.created_at
        || existing?.created_at
        || remote.updated_at
        || syncStartedAt;
      const remoteUpdatedAt = remote.updated_at || remote.created_at || createdAt;
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
        tag_id: remote.tag_id ?? null,
        created_at: createdAt,
        updated_at: remoteUpdatedAt,
      };

      if (remote.image) {
        try {
          const url = new URL(remote.image, VITE_SYNC_URL);
          if (
            remote.image.startsWith('lost_images/') ||
            remote.image.startsWith('found_images/')
          ) {
            if (!(await exists(remote.image, { baseDir: BaseDirectory.AppData }))) {
              const res = await fetch(url.href);
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

      try {
        if (existing) {
          const localUpdatedAt = existing.updated_at || existing.created_at;
          if (timestampValue(remoteUpdatedAt) > timestampValue(localUpdatedAt)) {
            await updateItem(item, remoteUpdatedAt);
          } else if (timestampValue(localUpdatedAt) > timestampValue(remoteUpdatedAt)) {
            itemsToPush.set(existing.id, existing);
          }
        } else {
          await addItemWithId(item);
        }
      } catch (e) {
        console.warn('Could not save remote item', item.id, e);
        remoteSaveFailed = true;
      }
    }

    const lastSyncValue = timestampValue(lastSync);
    for (const item of localItems) {
      if (remoteIds.has(item.id)) continue;
      if (!lastSync || timestampValue(item.updated_at || item.created_at) > lastSyncValue) {
        itemsToPush.set(item.id, item);
      }
    }

    for (const item of itemsToPush.values()) {
      const formData = new FormData();
      formData.append('item', JSON.stringify(item));
      const imagePath = item.image;

      if (imagePath && !imagePath.startsWith('http')) {
        await ensureDir(imagePath);
        if (await exists(imagePath, { baseDir: BaseDirectory.AppData })) {
          const binary = await readFile(imagePath, { baseDir: BaseDirectory.AppData });
          const filename = imagePath.split('/').pop() || imagePath;
          formData.append('imagePath', imagePath);
          formData.append('image', new Blob([binary]), filename);
        }
      }

      const response = await fetch(`${VITE_SYNC_URL}/sync`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Push failed for item ${item.id}: ${response.status}`);
      }
    }

    if (remoteSaveFailed) {
      throw new Error('Some remote rows could not be saved locally');
    }

    localStorage.setItem('inventory_last_sync', syncStartedAt);
    console.log('✅ Sync completed');
  } catch (error) {
    console.error('Sync error:', error);
  } finally {
    isSyncing = false;
  }
}

// Start periodic automatic synchronization in background.
export function startAutoSync(): void {
  void prefetchTagRanges();
  syncWithServer();
  setInterval(syncWithServer, SYNC_INTERVAL_MS);
}

/**
 * Clear local items, images, and sync timestamp while preserving reserved tag ranges.
 */
export async function resetLocalData(): Promise<void> {
  const database = await initDatabase();
  await database.execute('DELETE FROM items');
  await remove('lost_images', { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
  await remove('found_images', { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});

  localStorage.removeItem('inventory_last_sync');

  console.log('🗑️ Local data wiped');
}