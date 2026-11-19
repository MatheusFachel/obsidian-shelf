import { App, FuzzySuggestModal, Notice, TFile } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';

/** Link the folder of the currently open Markdown note without searching the vault tree. */
export function addCurrentNoteFolder(app: App, shelfManager: ShelfManager): void {
	const file = app.workspace.getActiveFile();
	if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') {
		new Notice('Open a Markdown note first.');
		return;
	}
	const path = file.parent?.path;
	if (!path || path === '/') {
		new Notice('This note is in the vault root. Choose a smaller folder to link.');
		return;
	}
	const shelves = shelfManager.getAllShelves().filter((shelf) => shelf.kind === 'folders');
	if (shelves.length === 0) {
		new Notice('Create a folder shelf first.');
		return;
	}
	if (shelves.length === 1 && shelves[0]) {
		void link(app, shelfManager, shelves[0], path);
		return;
	}
	new CurrentFolderShelfModal(app, shelfManager, shelves, path).open();
}

async function link(app: App, shelfManager: ShelfManager, shelf: Shelf, path: string): Promise<void> {
	try {
		if (!shelfManager.canAddFolderToShelf(shelf.id, path)) {
			new Notice(`“${path}” is already represented in “${shelf.name}”.`);
			return;
		}
		await shelfManager.addFolderToShelf(shelf.id, path);
		new Notice(`Added “${path}” to “${shelf.name}”.`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not add folder: ${message}`);
	}
}

class CurrentFolderShelfModal extends FuzzySuggestModal<Shelf> {
	constructor(
		app: App,
		private readonly shelfManager: ShelfManager,
		private readonly shelves: Shelf[],
		private readonly path: string,
	) {
		super(app);
		this.setPlaceholder(`Add “${path}” to which shelf?`);
	}

	getItems(): Shelf[] {
		const activeId = this.shelfManager.getActiveShelfId();
		return [...this.shelves].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
	}

	getItemText(shelf: Shelf): string {
		return shelf.name;
	}

	onChooseItem(shelf: Shelf): void {
		void link(this.app, this.shelfManager, shelf, this.path);
	}
}
