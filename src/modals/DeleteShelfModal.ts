import { App, Modal, Notice, Setting } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';

/** Confirm removing a shelf and its links without touching vault files. */
export class DeleteShelfModal extends Modal {
	private deleting = false;

	constructor(
		app: App,
		private readonly shelfManager: ShelfManager,
		private readonly shelf: Shelf,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.setTitle('Delete shelf?');
		this.contentEl.createEl('p', {
			text: `Delete “${this.shelf.name}” and remove its folder links? Files and folders will stay in your vault.`,
		});

		new Setting(this.contentEl)
			.addButton((button) => {
				button.setButtonText('Cancel').onClick(() => this.close());
			})
			.addButton((button) => {
				button.setButtonText('Delete shelf').setClass('shelf-delete-warning').onClick(() => {
					if (this.deleting) return;
					this.deleting = true;
					button.setDisabled(true);
					void this.deleteShelf().finally(() => {
						this.deleting = false;
						button.setDisabled(false);
					});
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async deleteShelf(): Promise<void> {
		try {
			await this.shelfManager.deleteShelf(this.shelf.id);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not delete shelf: ${message}`);
		}
	}
}
