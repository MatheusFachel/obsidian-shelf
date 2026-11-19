import type { Plugin } from 'obsidian';
import { CURRENT_DATA_VERSION, DEFAULT_DATA } from '../constants';
import type { Shelf, ShelfCollection, ShelfFolder, ShelfPluginData, ShelfSettings } from '../types';

/** Callback invoked after any mutation to persisted shelf data. */
export type ShelfChangeListener = (kind: 'data' | 'vault') => void;

/**
 * Owns the plugin's persisted data and exposes CRUD operations over shelves.
 *
 * All mutating methods persist to disk via `Plugin.saveData()` before resolving,
 * then notify subscribed listeners. Views re-render in response to notifications.
 *
 * This class intentionally keeps its internal `data` object private — callers go
 * through typed getters so we can evolve the storage shape without breaking views.
 */
export class ShelfManager {
	private data: ShelfPluginData;
	private savedData: ShelfPluginData;
	private pendingSave: Promise<void> = Promise.resolve();
	private changeVersion = 0;
	private readonly listeners = new Set<ShelfChangeListener>();

	constructor(private readonly plugin: Plugin) {
		// Seed with a safe default until `load()` is called.
		// JSON round-trip gives us a deep clone without depending on `structuredClone`.
		this.data = JSON.parse(JSON.stringify(DEFAULT_DATA)) as ShelfPluginData;
		this.savedData = this.cloneData(this.data);
	}

	/** Load persisted data from disk, merging over `DEFAULT_DATA`. Safe on first launch. */
	async load(): Promise<void> {
		const raw = (await this.plugin.loadData()) as Partial<ShelfPluginData> | null;
		this.data = this.mergeWithDefaults(raw);
		this.savedData = this.cloneData(this.data);
	}

	/** Reload changes written to data.json by another device or program. */
	async reloadFromDisk(): Promise<void> {
		await this.pendingSave;
		const version = this.changeVersion;
		const raw = (await this.plugin.loadData()) as Partial<ShelfPluginData> | null;
		// A local edit made while the read was in flight must win over that read.
		if (version !== this.changeVersion) return;
		const nextData = this.mergeWithDefaults(raw);
		if (JSON.stringify(nextData) === JSON.stringify(this.data)) return;
		this.data = nextData;
		this.savedData = this.cloneData(nextData);
		this.notify();
	}

	/** Persist the current in-memory data to `data.json`. */
	private async save(): Promise<void> {
		const snapshot = this.cloneData(this.data);
		const version = ++this.changeVersion;
		const write = this.pendingSave.then(async () => {
			try {
				await this.plugin.saveData(snapshot);
				this.savedData = snapshot;
			} catch (error) {
				if (version === this.changeVersion) {
					this.data = this.cloneData(this.savedData);
					this.notify();
				}
				throw error;
			}
		});
		// Keep the queue usable after a failed write while reporting that failure
		// to the action that initiated it.
		this.pendingSave = write.then(() => undefined, () => undefined);
		await write;
	}

	private cloneData(data: ShelfPluginData): ShelfPluginData {
		return JSON.parse(JSON.stringify(data)) as ShelfPluginData;
	}

	/**
	 * Produce a valid `ShelfPluginData` from a possibly-partial raw object.
	 *
	 * Always falls back to defaults for missing fields so that a freshly created
	 * vault, an empty `data.json`, or a future schema extension never crashes us.
	 */
	private mergeWithDefaults(raw: Partial<ShelfPluginData> | null): ShelfPluginData {
		if (!raw) {
			return JSON.parse(JSON.stringify(DEFAULT_DATA)) as ShelfPluginData;
		}
		// Version 1 stored an unused `order` number on each folder. The array is
		// already the display order, so keep its sequence and drop that field.
		const shelves: Shelf[] = Array.isArray(raw.shelves)
			? raw.shelves.map((shelf) => ({
				...shelf,
				kind: shelf.kind === 'tag' ? 'tag' as const : 'folders' as const,
				tag: shelf.kind === 'tag' && typeof shelf.tag === 'string' ? normalizeTag(shelf.tag) : null,
				folders: Array.isArray(shelf.folders)
					? shelf.folders.map((folder) => ({ path: folder.path }))
					: [],
				collections: Array.isArray(shelf.collections)
					? shelf.collections.filter((collection) => collection && typeof collection.id === 'string')
						.map((collection) => ({
							id: collection.id,
							name: typeof collection.name === 'string' ? collection.name : 'Collection',
							files: Array.isArray(collection.files)
								? collection.files.filter((path): path is string => typeof path === 'string') : [],
							createdAt: typeof collection.createdAt === 'number' ? collection.createdAt : Date.now(),
						}))
					: [],
			}))
			: [];
		const savedId = raw.activeShelfId;
		// Keep an intentional null selection, but recover if the saved id is missing.
		const activeShelfId = savedId === null
			? null
			: typeof savedId === 'string' && shelves.some((shelf) => shelf.id === savedId)
				? savedId
				: shelves[0]?.id ?? null;
		// Version 2 also stored two settings that had no effect. Rebuild the
		// settings object so those keys disappear on the next normal save.
		return {
			version: CURRENT_DATA_VERSION,
			activeShelfId,
			shelves,
			settings: {
				showFiles: typeof raw.settings?.showFiles === 'boolean'
					? raw.settings.showFiles
					: DEFAULT_DATA.settings.showFiles,
				fileExtensions: Array.isArray(raw.settings?.fileExtensions)
					? raw.settings.fileExtensions.filter((extension): extension is string => typeof extension === 'string')
					: [...DEFAULT_DATA.settings.fileExtensions],
				galleryThumbnailSize: typeof raw.settings?.galleryThumbnailSize === 'number' &&
					Number.isFinite(raw.settings.galleryThumbnailSize)
					? Math.max(100, Math.min(500, raw.settings.galleryThumbnailSize))
					: DEFAULT_DATA.settings.galleryThumbnailSize,
				galleryClickToZoom: typeof raw.settings?.galleryClickToZoom === 'boolean'
					? raw.settings.galleryClickToZoom
					: DEFAULT_DATA.settings.galleryClickToZoom,
			},
		};
	}

	// --- Read API -----------------------------------------------------------

	/**
	 * Return the current list of shelves in display order.
	 *
	 * `readonly Shelf[]` prevents callers from mutating the internal array;
	 * they must go through the write methods below to make changes durable.
	 */
	getAllShelves(): readonly Shelf[] {
		return this.data.shelves;
	}

	getShelf(id: string): Shelf | undefined {
		return this.data.shelves.find((s) => s.id === id);
	}

	getCollection(shelfId: string, collectionId: string): ShelfCollection | undefined {
		return this.getShelf(shelfId)?.collections.find((collection) => collection.id === collectionId);
	}

	getActiveShelfId(): string | null {
		return this.data.activeShelfId;
	}

	getActiveShelf(): Shelf | undefined {
		if (this.data.activeShelfId === null) return undefined;
		return this.getShelf(this.data.activeShelfId);
	}

	getSettings(): Readonly<ShelfSettings> {
		return this.data.settings;
	}

	/** Persist display settings and refresh the open shelf view. */
	async updateSettings(patch: Partial<ShelfSettings>): Promise<void> {
		this.data.settings = { ...this.data.settings, ...patch };
		await this.save();
		this.notify();
	}

	// --- Write API ----------------------------------------------------------

	/** Switch the active shelf. Pass `null` to clear the selection. */
	async setActiveShelf(id: string | null): Promise<void> {
		if (id !== null && !this.getShelf(id)) {
			throw new Error(`Shelf not found: ${id}`);
		}
		if (this.data.activeShelfId === id) return;
		this.data.activeShelfId = id;
		await this.save();
		this.notify();
	}

	/** Create a new shelf and append it to the list. Returns the created shelf. */
	async createShelf(input: {
		name: string;
		icon: string;
		color?: string | null;
		kind?: 'folders' | 'tag';
		tag?: string | null;
	}): Promise<Shelf> {
		const name = input.name.trim();
		if (!name) throw new Error('Shelf name cannot be empty');
		const kind = input.kind ?? 'folders';
		const tag = kind === 'tag' ? normalizeTag(input.tag ?? '') : null;
		if (kind === 'tag' && !tag) throw new Error('Enter a tag for this shelf');

		const shelf: Shelf = {
			id: crypto.randomUUID(),
			name,
			icon: input.icon,
			color: input.color ?? null,
			kind,
			tag,
			folders: [],
			collections: [],
			createdAt: Date.now(),
		};

		this.data.shelves.push(shelf);

		// Auto-select the first shelf created so the view has something to render.
		if (this.data.activeShelfId === null) {
			this.data.activeShelfId = shelf.id;
		}

		await this.save();
		this.notify();
		return shelf;
	}

	/** Partially update a shelf. Only the fields present in `patch` are touched. */
	async updateShelf(
		id: string,
		patch: Partial<Pick<Shelf, 'name' | 'icon' | 'color' | 'tag'>>,
	): Promise<void> {
		const shelf = this.getShelf(id);
		if (!shelf) throw new Error(`Shelf not found: ${id}`);
		const name = patch.name?.trim();
		if (patch.name !== undefined && !name) throw new Error('Shelf name cannot be empty');
		const tag = patch.tag !== undefined && shelf.kind === 'tag'
			? normalizeTag(patch.tag ?? '') : undefined;
		if (patch.tag !== undefined && shelf.kind === 'tag' && !tag) {
			throw new Error('Enter a tag for this shelf');
		}

		if (name !== undefined) shelf.name = name;
		if (patch.icon !== undefined) shelf.icon = patch.icon;
		if (patch.color !== undefined) shelf.color = patch.color;
		if (tag !== undefined) shelf.tag = tag;

		await this.save();
		this.notify();
	}

	/** Delete a shelf. If it was the active one, select the first remaining shelf (or none). */
	async deleteShelf(id: string): Promise<void> {
		const index = this.data.shelves.findIndex((s) => s.id === id);
		if (index < 0) return;
		this.data.shelves.splice(index, 1);

		if (this.data.activeShelfId === id) {
			this.data.activeShelfId = this.data.shelves[0]?.id ?? null;
		}

		await this.save();
		this.notify();
	}

	/** Reorder shelf icons without changing their IDs, contents, or active state. */
	async moveShelf(id: string, targetId: string | null, after = false): Promise<void> {
		if (!moveBeforeOrAfter(this.data.shelves, id, targetId, after, (shelf) => shelf.id)) return;
		await this.save();
		this.notify();
	}

	/** Append a folder path to a shelf. No-op if the folder is already linked. */
	async addFolderToShelf(shelfId: string, path: string): Promise<void> {
		const shelf = this.getShelf(shelfId);
		if (!shelf) throw new Error(`Shelf not found: ${shelfId}`);
		if (shelf.kind !== 'folders') throw new Error('Tag shelves cannot link folders');
		const overlap = this.findOverlappingFolder(shelf, path);
		if (overlap?.path === path) return;
		if (overlap) {
			throw new Error(`"${path}" overlaps with linked folder "${overlap.path}"`);
		}

		shelf.folders.push({ path });

		await this.save();
		this.notify();
	}

	/** A linked parent or child would show the same files twice in one shelf. */
	canAddFolderToShelf(shelfId: string, path: string): boolean {
		const shelf = this.getShelf(shelfId);
		return shelf !== undefined && shelf.kind === 'folders' && this.findOverlappingFolder(shelf, path) === undefined;
	}

	private findOverlappingFolder(shelf: Shelf, path: string): ShelfFolder | undefined {
		return shelf.folders.find((folder) =>
			folder.path === path ||
			folder.path.startsWith(path + '/') ||
			path.startsWith(folder.path + '/'),
		);
	}

	/** Remove a folder path from a shelf. No-op if the folder isn't linked. */
	async removeFolderFromShelf(shelfId: string, path: string): Promise<void> {
		const shelf = this.getShelf(shelfId);
		if (!shelf) throw new Error(`Shelf not found: ${shelfId}`);
		const index = shelf.folders.findIndex((f) => f.path === path);
		if (index < 0) return;
		shelf.folders.splice(index, 1);

		await this.save();
		this.notify();
	}

	/** Reorder only the linked roots of a shelf; vault folders stay where they are. */
	async moveLinkedFolder(shelfId: string, path: string, targetPath: string | null, after = false): Promise<void> {
		const shelf = this.getShelf(shelfId);
		if (!shelf) throw new Error(`Shelf not found: ${shelfId}`);
		if (!moveBeforeOrAfter(shelf.folders, path, targetPath, after, (folder) => folder.path)) return;
		await this.save();
		this.notify();
	}

	/** Create a named collection of image references inside a shelf. */
	async createCollection(shelfId: string, name: string): Promise<ShelfCollection> {
		const shelf = this.getShelf(shelfId);
		if (!shelf) throw new Error(`Shelf not found: ${shelfId}`);
		const trimmed = name.trim();
		if (!trimmed) throw new Error('Collection name cannot be empty');
		const collection: ShelfCollection = {
			id: crypto.randomUUID(), name: trimmed, files: [], createdAt: Date.now(),
		};
		shelf.collections.push(collection);
		await this.save();
		this.notify();
		return collection;
	}

	async renameCollection(shelfId: string, collectionId: string, name: string): Promise<void> {
		const collection = this.getCollection(shelfId, collectionId);
		if (!collection) throw new Error('Collection not found');
		const trimmed = name.trim();
		if (!trimmed) throw new Error('Collection name cannot be empty');
		if (collection.name === trimmed) return;
		collection.name = trimmed;
		await this.save();
		this.notify();
	}

	async deleteCollection(shelfId: string, collectionId: string): Promise<void> {
		const shelf = this.getShelf(shelfId);
		if (!shelf) throw new Error(`Shelf not found: ${shelfId}`);
		const index = shelf.collections.findIndex((collection) => collection.id === collectionId);
		if (index < 0) return;
		shelf.collections.splice(index, 1);
		await this.save();
		this.notify();
	}

	async addFileToCollection(shelfId: string, collectionId: string, path: string): Promise<void> {
		const collection = this.getCollection(shelfId, collectionId);
		if (!collection) throw new Error('Collection not found');
		if (collection.files.includes(path)) return;
		collection.files.push(path);
		await this.save();
		this.notify();
	}

	async removeFileFromCollection(shelfId: string, collectionId: string, path: string): Promise<void> {
		const collection = this.getCollection(shelfId, collectionId);
		if (!collection) throw new Error('Collection not found');
		const index = collection.files.indexOf(path);
		if (index < 0) return;
		collection.files.splice(index, 1);
		await this.save();
		this.notify();
	}

	// --- Path synchronisation -----------------------------------------------

	/**
	 * Rewrite any folder reference matching `oldPath` or a descendant of it to use `newPath`.
	 * Used to keep shelves in sync when a linked folder (or ancestor of one) is renamed/moved.
	 */
	async updateFolderPath(oldPath: string, newPath: string): Promise<void> {
		let changed = false;
		for (const shelf of this.data.shelves) {
			let shelfChanged = false;
			for (const folder of shelf.folders) {
				if (folder.path === oldPath) {
					folder.path = newPath;
					changed = true;
					shelfChanged = true;
				} else if (folder.path.startsWith(oldPath + '/')) {
					folder.path = newPath + folder.path.slice(oldPath.length);
					changed = true;
					shelfChanged = true;
				}
			}
			if (shelfChanged) {
				// A move can place one linked root inside another linked root.
				// Keep the parent, since expanding it already exposes the child.
				shelf.folders = shelf.folders.filter((folder, index, folders) =>
					!folders.some((other, otherIndex) => otherIndex !== index && (
						folder.path.startsWith(other.path + '/') ||
						(folder.path === other.path && otherIndex < index)
					)),
				);
			}
			for (const collection of shelf.collections) {
				collection.files = collection.files.map((path) => {
					if (path !== oldPath && !path.startsWith(oldPath + '/')) return path;
					changed = true;
					return newPath + path.slice(oldPath.length);
				});
			}
		}
		if (changed) {
			await this.save();
			this.notify();
		}
	}

	/** Keep collection references pointing to a renamed or moved image. */
	async updateFilePath(oldPath: string, newPath: string): Promise<void> {
		let changed = false;
		for (const shelf of this.data.shelves) {
			for (const collection of shelf.collections) {
				collection.files = collection.files.map((path) => {
					if (path !== oldPath) return path;
					changed = true;
					return newPath;
				});
			}
		}
		if (!changed) return;
		await this.save();
		this.notify();
	}

	/**
	 * Drop any folder reference at `path` or under it from every shelf.
	 * Used when a linked folder is deleted from the vault.
	 */
	async removeFolderPath(path: string): Promise<void> {
		let changed = false;
		for (const shelf of this.data.shelves) {
			const before = shelf.folders.length;
			shelf.folders = shelf.folders.filter(
				(f) => f.path !== path && !f.path.startsWith(path + '/'),
			);
			if (shelf.folders.length !== before) changed = true;
		}
		if (changed) {
			await this.save();
			this.notify();
		}
	}

	// --- Subscription -------------------------------------------------------

	/** Refresh subscribed views when vault contents change without changing shelf data. */
	notifyVaultChanged(): void {
		this.notify('vault');
	}

	/** Subscribe to change notifications. Returns a function that unsubscribes. */
	subscribe(listener: ShelfChangeListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(kind: 'data' | 'vault' = 'data'): void {
		for (const listener of this.listeners) {
			listener(kind);
		}
	}
}

/** Store tags in the same form returned by Obsidian's metadata cache. */
function normalizeTag(value: string): string | null {
	const tag = value.trim().replace(/^#/, '');
	return tag && !/[\s#]/.test(tag) ? `#${tag}` : null;
}

/** Reorder a persisted array while leaving it untouched for invalid or no-op moves. */
function moveBeforeOrAfter<T>(
	items: T[], sourceId: string, targetId: string | null, after: boolean, getId: (item: T) => string,
): boolean {
	const sourceIndex = items.findIndex((item) => getId(item) === sourceId);
	if (sourceIndex < 0) throw new Error(`Item not found: ${sourceId}`);
	if (targetId === sourceId) return false;
	if (targetId !== null && !items.some((item) => getId(item) === targetId)) {
		throw new Error(`Drop target not found: ${targetId}`);
	}
	const before = items.map(getId).join('\0');
	const [source] = items.splice(sourceIndex, 1);
	if (!source) return false;
	const targetIndex = targetId === null ? items.length : items.findIndex((item) => getId(item) === targetId);
	items.splice(targetIndex + (targetId !== null && after ? 1 : 0), 0, source);
	return items.map(getId).join('\0') !== before;
}
