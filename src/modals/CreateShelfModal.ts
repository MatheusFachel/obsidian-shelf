import { App, Modal, Notice, Setting } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';

/**
 * Minimal modal to create a new shelf.
 *
 * Two text fields (name + icon) and two buttons (cancel + create).
 * The icon picker from Phase 3 will replace the plain text input for icons.
 */
export class CreateShelfModal extends Modal {
	private name = '';
	private icon = 'library';

	constructor(
		app: App,
		private readonly shelfManager: ShelfManager,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('shelf-modal');

		this.setTitle('Create shelf');

		new Setting(contentEl)
			.setName('Name')
			.setDesc('Display name shown in the sidebar.')
			.addText((text) => {
				text
					.setPlaceholder('Shelf name')
					.setValue(this.name)
					.onChange((value) => {
						this.name = value;
					});
				// Focus the name field as soon as the modal opens.
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		new Setting(contentEl)
			.setName('Icon')
			.setDesc('Lucide icon name (e.g. "book-open") or an emoji.')
			.addText((text) => {
				text
					.setPlaceholder('Icon name or emoji')
					.setValue(this.icon)
					.onChange((value) => {
						this.icon = value;
					});
			});

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Cancel').onClick(() => this.close());
			})
			.addButton((btn) => {
				btn
					.setButtonText('Create')
					.setCta()
					.onClick(() => {
						void this.submit();
					});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Validate input and delegate to the manager. Shows a Notice on failure. */
	private async submit(): Promise<void> {
		try {
			await this.shelfManager.createShelf({
				name: this.name,
				icon: this.icon.trim() || 'library',
			});
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		}
	}
}
