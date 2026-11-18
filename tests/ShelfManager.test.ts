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
		folders: paths.map((path) => ({ path })),
		createdAt: 1,
	};
}

function makeData(shelves: Shelf[], activeShelfId: string | null = shelves[0]?.id ?? null): ShelfPluginData {
	return {
		version: 3,
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
		expect(saved.version).toBe(3);
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
			'Library', 'Library/Novels', 'Bookshelf',
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
});
