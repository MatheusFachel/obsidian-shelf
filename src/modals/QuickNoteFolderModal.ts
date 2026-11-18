import { App, FuzzySuggestModal, normalizePath, Notice, TFolder } from 'obsidian';
import type { TFile } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';

/** Create an untitled Markdown note in the active shelf, choosing a root when needed. */
export function openQuickNote(
	app: App, shelfManager: ShelfManager, onCreated?: (folderPath: string) => void,
): void {
	const shelf = shelfManager.getActiveShelf();
	if (!shelf) {
		new Notice('Select a shelf before creating a quick note.');
		return;
	}
	const folders = shelf.folders
		.map((reference) => app.vault.getAbstractFileByPath(reference.path))
		.filter((item): item is TFolder => item instanceof TFolder);
	if (folders.length === 0) {
		new Notice('Link a folder to this shelf before creating a quick note.');
		return;
	}
	const create = (folder: TFolder): void => {
		void createQuickNote(app, folder, onCreated);
	};
	if (folders.length === 1 && folders[0]) create(folders[0]);
	else new QuickNoteFolderModal(app, folders, create).open();
}

/** The user can rename the generated note afterward through Shelf or Obsidian. */
export async function createQuickNote(
	app: App, folder: TFolder, onCreated?: (folderPath: string) => void,
): Promise<void> {
	if (app.vault.getAbstractFileByPath(folder.path) !== folder) {
		new Notice('This folder no longer exists in the vault.');
		return;
	}
	let index = 0;
	let path: string;
	do {
		const name = index === 0 ? 'Untitled.md' : `Untitled ${index}.md`;
		path = normalizePath(`${folder.path}/${name}`);
		index++;
	} while (app.vault.getAbstractFileByPath(path));

	let file: TFile;
	try {
		file = await app.vault.create(path, '');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not create quick note: ${message}`);
		return;
	}
	onCreated?.(folder.path);
	try {
		await app.workspace.getLeaf().openFile(file);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Quick note created, but could not open it: ${message}`);
	}
}

class QuickNoteFolderModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly folders: TFolder[],
		private readonly onChoose: (folder: TFolder) => void,
	) {
		super(app);
		this.setPlaceholder('Choose a folder for the quick note…');
	}

	getItems(): TFolder[] {
		return this.folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
