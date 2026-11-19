import type { Plugin } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { ShelfManager } from '../src/services/ShelfManager';
import type { Shelf, ShelfPluginData } from '../src/types';

function copy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function makeShelf(id: string, paths: string[]): Shelf {
	return {
		id,
		name: id,
		icon: 'library',
		color: null,
		kind: 'folders',
		tag: null,
		folders: paths.map((path) => ({ path })),
		collections: [],
		createdAt: 1,
	};
}

function makeData(shelves: Shelf[], activeShelfId: string | null = shelves[0]?.id ?? null): ShelfPluginData {
	return {
		version: 4,
		activeShelfId,
		shelves,
		settings: {
			showFiles: true, fileExtensions: ['md'],
			galleryThumbnailSize: 200, galleryClickToZoom: true,
		},
	};
}

function makeHarness(initialData: unknown) {
	let diskData = copy(initialData);
	const saveData = vi.fn(async (value: unknown) => {
		diskData = copy(value);
	});
	const loadData = vi.fn(async () => copy(diskData));
	const plugin = {
		loadData,
		saveData,
	} as unknown as Plugin;
	return {
		manager: new ShelfManager(plugin),
		loadData,
		saveData,
		readDisk: () => copy(diskData),
		writeDisk: (value: unknown) => { diskData = copy(value); },
	};
}

describe('ShelfManager persistence', () => {
	it('reorders shelves without changing the selected shelf or linked folders', async () => {
		const harness = makeHarness(makeData([
			makeShelf('first', ['Books']), makeShelf('second', ['Projects']), makeShelf('third', []),
		], 'second'));
		await harness.manager.load();
		await harness.manager.moveShelf('first', 'third', true);
		expect((harness.readDisk() as ShelfPluginData).shelves.map((shelf) => shelf.id))
			.toEqual(['second', 'third', 'first']);
		expect(harness.manager.getActiveShelfId()).toBe('second');
		expect(harness.manager.getShelf('first')?.folders).toEqual([{ path: 'Books' }]);
		await harness.manager.moveShelf('first', 'second');
		expect(harness.manager.getAllShelves().map((shelf) => shelf.id))
			.toEqual(['first', 'second', 'third']);
		const saves = harness.saveData.mock.calls.length;
		await harness.manager.moveShelf('first', 'second');
		expect(harness.saveData).toHaveBeenCalledTimes(saves);
		await expect(harness.manager.moveShelf('first', 'missing')).rejects.toThrow('Drop target not found');
		expect(harness.manager.getAllShelves().map((shelf) => shelf.id))
			.toEqual(['first', 'second', 'third']);
	});

	it('reorders linked roots only within their shelf', async () => {
		const harness = makeHarness(makeData([
			makeShelf('first', ['Books', 'Music', 'Projects']), makeShelf('second', ['Other']),
		]));
		await harness.manager.load();
		await harness.manager.moveLinkedFolder('first', 'Projects', 'Books');
		const saved = harness.readDisk() as ShelfPluginData;
		expect(saved.shelves[0]?.folders.map((folder) => folder.path))
			.toEqual(['Projects', 'Books', 'Music']);
		expect(saved.shelves[1]?.folders).toEqual([{ path: 'Other' }]);
		await expect(harness.manager.moveLinkedFolder('first', 'Other', 'Books'))
			.rejects.toThrow('Item not found');
	});

	it('persists display settings without changing shelf data', async () => {
		const harness = makeHarness(makeData([makeShelf('first', ['Books'])]));
		await harness.manager.load();
		await harness.manager.updateSettings({ showFiles: false, fileExtensions: ['md'] });
		const saved = harness.readDisk() as ShelfPluginData;
		expect(saved.settings).toEqual({
			showFiles: false, fileExtensions: ['md'],
			galleryThumbnailSize: 200, galleryClickToZoom: true,
		});
		expect(saved.shelves[0]?.folders).toEqual([{ path: 'Books' }]);
	});

	it('edits a shelf while preserving its identity and linked folders', async () => {
		const harness = makeHarness(makeData([makeShelf('first', ['Books'])]));
		await harness.manager.load();
		await harness.manager.updateShelf('first', {
			name: ' Reading ', icon: 'book-open', color: '#336699',
		});

		const saved = harness.readDisk() as ShelfPluginData;
		expect(saved.shelves[0]).toMatchObject({
			id: 'first', name: 'Reading', icon: 'book-open', color: '#336699',
			folders: [{ path: 'Books' }], createdAt: 1,
		});
		expect(saved.activeShelfId).toBe('first');
	});

	it('deletes only the selected shelf and selects the next available one', async () => {
		const harness = makeHarness(makeData([
			makeShelf('first', ['Books']), makeShelf('second', ['Projects']),
		]));
		await harness.manager.load();
		await harness.manager.deleteShelf('first');

		const saved = harness.readDisk() as ShelfPluginData;
		expect(saved.shelves).toEqual([makeShelf('second', ['Projects'])]);
		expect(saved.activeShelfId).toBe('second');
		await harness.manager.deleteShelf('second');
		expect((harness.readDisk() as ShelfPluginData).activeShelfId).toBeNull();
	});

	it('migrates old fields on the next normal save without changing folder order', async () => {
		const first = makeShelf('first', ['Books', 'Music']);
		first.color = '#cc8844';
		const second = makeShelf('second', ['Projects']);
		const legacy = {
			...makeData([first, second]),
			version: 2,
			shelves: [
			{ ...first, folders: [{ path: 'Books', order: 50 }, { path: 'Music', order: 1 }] },
			second,
			],
			settings: {
				showBadgeCount: true,
				showFiles: false,
				fileExtensions: ['md'],
				nnIntegration: true,
			},
		};
		const harness = makeHarness(legacy);
		await harness.manager.load();

		expect(harness.manager.getAllShelves()[0]?.folders).toEqual([
			{ path: 'Books' }, { path: 'Music' },
		]);
		expect(harness.saveData).not.toHaveBeenCalled();

		await harness.manager.setActiveShelf('second');
		const saved = harness.readDisk() as ShelfPluginData;
		expect(saved.version).toBe(4);
		expect(saved.shelves[0]?.folders).toEqual([{ path: 'Books' }, { path: 'Music' }]);
		expect(saved.shelves[0]?.color).toBe('#cc8844');
		expect(saved.settings).toEqual({
			showFiles: false, fileExtensions: ['md'],
			galleryThumbnailSize: 200, galleryClickToZoom: true,
		});
	});

	it('recovers an orphaned active shelf id while keeping an intentional null selection', async () => {
		const shelves = [makeShelf('first', []), makeShelf('second', [])];
		const orphan = makeHarness(makeData(shelves, 'deleted'));
		await orphan.manager.load();
		expect(orphan.manager.getActiveShelfId()).toBe('first');

		const unselected = makeHarness(makeData(shelves, null));
		await unselected.manager.load();
		expect(unselected.manager.getActiveShelfId()).toBeNull();
	});

	it('updates an exact linked folder and its descendants, but not similar names', async () => {
		const harness = makeHarness(makeData([
			makeShelf('first', ['Books', 'Books/Novels', 'Bookshelf']),
			makeShelf('second', ['Books/Poetry']),
		]));
		await harness.manager.load();
		await harness.manager.updateFolderPath('Books', 'Library');

		const saved = harness.readDisk() as ShelfPluginData;
		expect(saved.shelves[0]?.folders.map((folder) => folder.path)).toEqual([
			'Library', 'Bookshelf',
		]);
		expect(saved.shelves[1]?.folders[0]?.path).toBe('Library/Poetry');
		expect(harness.saveData).toHaveBeenCalledOnce();
	});

	it('deletes linked paths under a removed folder without touching a sibling prefix', async () => {
		const harness = makeHarness(makeData([
			makeShelf('first', ['Books', 'Books/Novels', 'Bookshelf']),
			makeShelf('second', ['Books/Poetry', 'Other']),
		]));
		await harness.manager.load();
		await harness.manager.removeFolderPath('Books');

		const saved = harness.readDisk() as ShelfPluginData;
		expect(saved.shelves[0]?.folders).toEqual([{ path: 'Bookshelf' }]);
		expect(saved.shelves[1]?.folders).toEqual([{ path: 'Other' }]);
	});

	it('rejects parent and child roots in one shelf while allowing another shelf', async () => {
		const harness = makeHarness(makeData([
			makeShelf('parent', ['Books']),
			makeShelf('child', ['Books/Novels']),
			makeShelf('other', []),
		]));
		await harness.manager.load();

		expect(harness.manager.canAddFolderToShelf('parent', 'Books/Novels')).toBe(false);
		expect(harness.manager.canAddFolderToShelf('child', 'Books')).toBe(false);
		expect(harness.manager.canAddFolderToShelf('parent', 'Bookshelf')).toBe(true);
		expect(harness.manager.canAddFolderToShelf('other', 'Books')).toBe(true);
		await expect(harness.manager.addFolderToShelf('parent', 'Books/Novels')).rejects.toThrow('overlaps');
		expect(harness.saveData).not.toHaveBeenCalled();
	});

	it('reloads external changes once and retains the current state after a read failure', async () => {
		const initial = makeData([makeShelf('first', ['Books'])]);
		const harness = makeHarness(initial);
		await harness.manager.load();
		const listener = vi.fn();
		harness.manager.subscribe(listener);

		harness.writeDisk(makeData([makeShelf('first', ['Books', 'Music'])]));
		await harness.manager.reloadFromDisk();
		await harness.manager.reloadFromDisk();
		expect(listener).toHaveBeenCalledOnce();
		harness.loadData.mockRejectedValueOnce(new Error('read failed'));
		await expect(harness.manager.reloadFromDisk()).rejects.toThrow('read failed');
		expect(harness.manager.getActiveShelf()?.folders).toEqual([
			{ path: 'Books' }, { path: 'Music' },
		]);
	});

	it('serializes saves so a slower first write cannot overwrite the latest state', async () => {
		const harness = makeHarness(makeData([makeShelf('first', [])]));
		await harness.manager.load();
		let finishFirst!: () => void;
		const firstWrite = new Promise<void>((resolve) => { finishFirst = resolve; });
		harness.saveData.mockImplementationOnce(async () => { await firstWrite; });
		const first = harness.manager.updateSettings({ showFiles: false });
		await Promise.resolve();
		const second = harness.manager.updateSettings({ galleryThumbnailSize: 300 });
		expect(harness.saveData).toHaveBeenCalledTimes(1);
		finishFirst();
		await Promise.all([first, second]);
		expect(harness.saveData).toHaveBeenCalledTimes(2);
		expect((harness.readDisk() as ShelfPluginData).settings).toMatchObject({
			showFiles: false, galleryThumbnailSize: 300,
		});
	});

	it('restores the last saved state after a failed write', async () => {
		const harness = makeHarness(makeData([makeShelf('first', [])]));
		await harness.manager.load();
		harness.saveData.mockRejectedValueOnce(new Error('disk full'));
		await expect(harness.manager.updateSettings({ showFiles: false })).rejects.toThrow('disk full');
		expect(harness.manager.getSettings().showFiles).toBe(true);
		await harness.manager.updateSettings({ galleryThumbnailSize: 300 });
		expect((harness.readDisk() as ShelfPluginData).settings).toMatchObject({
			showFiles: true, galleryThumbnailSize: 300,
		});
	});

	it('waits for a pending local save before reloading the data file', async () => {
		const harness = makeHarness(makeData([makeShelf('first', [])]));
		await harness.manager.load();
		let finishWrite!: () => void;
		const writeGate = new Promise<void>((resolve) => { finishWrite = resolve; });
		harness.saveData.mockImplementationOnce(async (value) => {
			await writeGate;
			harness.writeDisk(value);
		});
		const update = harness.manager.updateSettings({ showFiles: false });
		await Promise.resolve();
		const reload = harness.manager.reloadFromDisk();
		expect(harness.loadData).toHaveBeenCalledOnce();
		finishWrite();
		await Promise.all([update, reload]);
		expect(harness.manager.getSettings().showFiles).toBe(false);
		expect((harness.readDisk() as ShelfPluginData).settings.showFiles).toBe(false);
	});

	it('drops a moved root when it becomes a child of another linked root', async () => {
		const harness = makeHarness(makeData([makeShelf('first', ['A', 'B'])]));
		await harness.manager.load();
		await harness.manager.updateFolderPath('A', 'B/A');
		expect(harness.manager.getShelf('first')?.folders).toEqual([{ path: 'B' }]);
		expect((harness.readDisk() as ShelfPluginData).shelves[0]?.folders).toEqual([{ path: 'B' }]);
	});

	it('migrates shelves from the previous schema without losing folder links', async () => {
		const oldShelf = makeShelf('legacy', ['Books']);
		const raw = { ...makeData([oldShelf]), version: 3 } as unknown as ShelfPluginData;
		delete (raw.shelves[0] as unknown as Record<string, unknown>).kind;
		delete (raw.shelves[0] as unknown as Record<string, unknown>).tag;
		delete (raw.shelves[0] as unknown as Record<string, unknown>).collections;
		const harness = makeHarness(raw);
		await harness.manager.load();
		expect(harness.manager.getShelf('legacy')).toMatchObject({
			kind: 'folders', tag: null, collections: [], folders: [{ path: 'Books' }],
		});
		await harness.manager.updateSettings({ showFiles: false });
		expect((harness.readDisk() as ShelfPluginData).version).toBe(4);
	});

	it('creates a tag shelf and keeps folder links restricted to folder shelves', async () => {
		const harness = makeHarness(makeData([]));
		await harness.manager.load();
		const shelf = await harness.manager.createShelf({
			name: 'Project', icon: 'tag', kind: 'tag', tag: ' #project-alpha ',
		});
		expect(shelf).toMatchObject({ kind: 'tag', tag: '#project-alpha', folders: [] });
		await expect(harness.manager.addFolderToShelf(shelf.id, 'Projects')).rejects.toThrow('cannot link');
		await harness.manager.updateShelf(shelf.id, { tag: '#research' });
		expect(harness.manager.getShelf(shelf.id)?.tag).toBe('#research');
		await expect(harness.manager.updateShelf(shelf.id, { tag: 'two words' })).rejects.toThrow();
		expect(harness.manager.getShelf(shelf.id)?.tag).toBe('#research');
	});

	it('keeps collection references in sync with image and folder renames', async () => {
		const harness = makeHarness(makeData([makeShelf('first', ['Pictures'])]));
		await harness.manager.load();
		const collection = await harness.manager.createCollection('first', 'Moodboard');
		await harness.manager.renameCollection('first', collection.id, 'References');
		expect(harness.manager.getCollection('first', collection.id)?.name).toBe('References');
		await harness.manager.addFileToCollection('first', collection.id, 'Pictures/blue.png');
		await harness.manager.addFileToCollection('first', collection.id, 'Pictures/blue.png');
		expect(harness.manager.getCollection('first', collection.id)?.files).toEqual(['Pictures/blue.png']);
		await harness.manager.updateFilePath('Pictures/blue.png', 'Pictures/azure.png');
		await harness.manager.updateFolderPath('Pictures', 'Images');
		expect(harness.manager.getCollection('first', collection.id)?.files).toEqual(['Images/azure.png']);
		await harness.manager.removeFileFromCollection('first', collection.id, 'Images/azure.png');
		expect(harness.manager.getCollection('first', collection.id)?.files).toEqual([]);
		await harness.manager.deleteCollection('first', collection.id);
		expect(harness.manager.getCollection('first', collection.id)).toBeUndefined();
	});
});
