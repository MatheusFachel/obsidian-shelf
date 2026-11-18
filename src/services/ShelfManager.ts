import type { Plugin } from 'obsidian';
import { CURRENT_DATA_VERSION, DEFAULT_DATA } from '../constants';
import type { Shelf, ShelfFolder, ShelfPluginData, ShelfSettings } from '../types';

/** Callback invoked after any mutation to persisted shelf data. */
export type ShelfChangeListener = () => void;

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
	private readonly listeners = new Set<ShelfChangeListener>();

	constructor(private readonly plugin: Plugin) {
		// Seed with a safe default until `load()` is called.
		// JSON round-trip gives us a deep clone without depending on `structuredClone`.
		this.data = JSON.parse(JSON.stringify(DEFAULT_DATA)) as ShelfPluginData;
	}

	/** Load persisted data from disk, merging over `DEFAULT_DATA`. Safe on first launch. */
	async load(): Promise<void> {
		const raw = (await this.plugin.loadData()) as Partial<ShelfPluginData> | null;
		this.data = this.mergeWithDefaults(raw);
	}

	/** Reload changes written to data.json by another device or program. */
	async reloadFromDisk(): Promise<void> {
		const raw = (await this.plugin.loadData()) as Partial<ShelfPluginData> | null;
		const nextData = this.mergeWithDefaults(raw);
		if (JSON.stringify(nextData) === JSON.stringify(this.data)) return;
		this.data = nextData;
		this.notify();
	}

	/** Persist the current in-memory data to `data.json`. */
	private async save(): Promise<void> {
		await this.plugin.saveData(this.data);
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
				folders: Array.isArray(shelf.folders)
					? shelf.folders.map((folder) => ({ path: folder.path }))
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
	}): Promise<Shelf> {
		const name = input.name.trim();
		if (!name) throw new Error('Shelf name cannot be empty');

		const shelf: Shelf = {
			id: crypto.randomUUID(),
			name,
			icon: input.icon,
			color: input.color ?? null,
			folders: [],
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
		patch: Partial<Pick<Shelf, 'name' | 'icon' | 'color'>>,
	): Promise<void> {
		const shelf = this.getShelf(id);
		if (!shelf) throw new Error(`Shelf not found: ${id}`);

		if (patch.name !== undefined) {
			const name = patch.name.trim();
			if (!name) throw new Error('Shelf name cannot be empty');
			shelf.name = name;
		}
		if (patch.icon !== undefined) shelf.icon = patch.icon;
		if (patch.color !== undefined) shelf.color = patch.color;

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
		return shelf !== undefined && this.findOverlappingFolder(shelf, path) === undefined;
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

	// --- Path synchronisation -----------------------------------------------

	/**
	 * Rewrite any folder reference matching `oldPath` or a descendant of it to use `newPath`.
	 * Used to keep shelves in sync when a linked folder (or ancestor of one) is renamed/moved.
	 */
	async updateFolderPath(oldPath: string, newPath: string): Promise<void> {
		let changed = false;
		for (const shelf of this.data.shelves) {
			for (const folder of shelf.folders) {
				if (folder.path === oldPath) {
					folder.path = newPath;
					changed = true;
				} else if (folder.path.startsWith(oldPath + '/')) {
					folder.path = newPath + folder.path.slice(oldPath.length);
					changed = true;
				}
			}
		}
		if (changed) {
			await this.save();
			this.notify();
		}
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
		this.notify();
	}

	/** Subscribe to change notifications. Returns a function that unsubscribes. */
	subscribe(listener: ShelfChangeListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
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
