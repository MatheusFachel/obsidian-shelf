import { App, FuzzySuggestModal, Notice } from 'obsidian';
import type { TFolder } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';

/**
 * Fuzzy-search modal for picking a vault folder to link into a shelf.
 *
 * Built on Obsidian's `FuzzySuggestModal`, which gives us:
 *  - The familiar "Quick Switcher" look and feel
 *  - Fuzzy matching across the whole list as the user types
 *  - Keyboard navigation (arrows + enter) for free
 *
 * Folders already represented by a linked parent or child are filtered out.
 */
export class AddFolderModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly shelfManager: ShelfManager,
		private readonly shelf: Shelf,
	) {
		super(app);
		this.setPlaceholder('Search for a folder to add…');
		this.setInstructions([
			{ command: '↑↓', purpose: 'navigate' },
			{ command: '↵', purpose: 'add to shelf' },
			{ command: 'esc', purpose: 'cancel' },
		]);
	}

	/** All vault folders except the root and folders overlapping a linked root. */
	getItems(): TFolder[] {
		return this.app.vault
			.getAllFolders(false)
			.filter((folder) => this.shelfManager.canAddFolderToShelf(this.shelf.id, folder.path))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		void this.linkFolder(folder);
	}

	private async linkFolder(folder: TFolder): Promise<void> {
		try {
			await this.shelfManager.addFolderToShelf(this.shelf.id, folder.path);
			new Notice(`Added "${folder.path}" to shelf "${this.shelf.name}"`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		}
	}
}
