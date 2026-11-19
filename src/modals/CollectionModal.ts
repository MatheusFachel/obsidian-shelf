import { App, Modal, Notice, Setting } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf, ShelfCollection } from '../types';

/** Create or rename a collection; image files are never changed here. */
export class CollectionModal extends Modal {
	private name: string;
	private saving = false;

	constructor(
		app: App,
		private readonly shelfManager: ShelfManager,
		private readonly shelf: Shelf,
		private readonly collection?: ShelfCollection,
	) {
		super(app);
		this.name = collection?.name ?? '';
	}

	onOpen(): void {
		this.contentEl.empty();
		this.setTitle(this.collection ? 'Rename collection' : 'New collection');
		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.setValue(this.name).setPlaceholder('Collection name').onChange((value) => { this.name = value; });
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') { event.preventDefault(); void this.save(); }
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => button.setButtonText(this.collection ? 'Save' : 'Create').setCta()
				.onClick(() => { void this.save(); }));
	}

	onClose(): void { this.contentEl.empty(); }

	private async save(): Promise<void> {
		if (this.saving) return;
		this.saving = true;
		try {
			if (this.collection) await this.shelfManager.renameCollection(this.shelf.id, this.collection.id, this.name);
			else await this.shelfManager.createCollection(this.shelf.id, this.name);
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		} finally {
			this.saving = false;
		}
	}
}

/** Delete one collection without touching any referenced vault image. */
export class DeleteCollectionModal extends Modal {
	private deleting = false;

	constructor(
		app: App,
		private readonly shelfManager: ShelfManager,
		private readonly shelf: Shelf,
		private readonly collection: ShelfCollection,
	) { super(app); }

	onOpen(): void {
		this.contentEl.empty();
		this.setTitle('Delete collection?');
		this.contentEl.createEl('p', {
			text: `Delete “${this.collection.name}”? Its images will stay in the vault.`,
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => button.setButtonText('Delete collection').setDestructive().onClick(() => {
				void this.remove();
			}));
	}

	onClose(): void { this.contentEl.empty(); }

	private async remove(): Promise<void> {
		if (this.deleting) return;
		this.deleting = true;
		try {
			await this.shelfManager.deleteCollection(this.shelf.id, this.collection.id);
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		} finally {
			this.deleting = false;
		}
	}
}
