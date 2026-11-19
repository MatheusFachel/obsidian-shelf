import { App, FuzzySuggestModal, Notice, TFile } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf, ShelfCollection } from '../types';

type Destination = { shelf: Shelf; collection: ShelfCollection };

/** Pick a collection for one image without copying or moving its vault file. */
export class AddImageToCollectionModal extends FuzzySuggestModal<Destination> {
	constructor(
		app: App,
		private readonly shelfManager: ShelfManager,
		private readonly file: TFile,
	) {
		super(app);
		this.setPlaceholder(`Add “${file.name}” to a collection…`);
	}

	getItems(): Destination[] {
		const result: Destination[] = [];
		for (const shelf of this.shelfManager.getAllShelves()) {
			for (const collection of shelf.collections) result.push({ shelf, collection });
		}
		return result;
	}

	getItemText(destination: Destination): string {
		return `${destination.shelf.name} / ${destination.collection.name}`;
	}

	onChooseItem(destination: Destination): void {
		void this.add(destination);
	}

	private async add(destination: Destination): Promise<void> {
		if (this.app.vault.getAbstractFileByPath(this.file.path) !== this.file) {
			new Notice('This image no longer exists.');
			return;
		}
		try {
			await this.shelfManager.addFileToCollection(
				destination.shelf.id, destination.collection.id, this.file.path,
			);
			new Notice(`Added to “${destination.collection.name}”.`);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
