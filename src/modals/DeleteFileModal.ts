import { App, Modal, Notice, Setting, TAbstractFile, TFolder } from 'obsidian';

/** Confirm a file or folder deletion before applying the user's trash preference. */
export class DeleteFileModal extends Modal {
	private deleting = false;

	constructor(app: App, private readonly file: TAbstractFile) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.file instanceof TFolder ? 'Delete folder?' : 'Delete file?');

		contentEl.createEl('p', {
			text: this.file instanceof TFolder
				? `Delete "${this.file.path}" and everything inside it?`
				: `Delete "${this.file.path}"?`,
		});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('Cancel').onClick(() => this.close());
			})
			.addButton((button) => {
				button
					.setButtonText('Delete')
					.setClass('shelf-delete-warning')
					.onClick(() => {
						if (this.deleting) return;
						this.deleting = true;
						button.setDisabled(true);
						void this.deleteFile().finally(() => {
							this.deleting = false;
							button.setDisabled(false);
						});
					});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async deleteFile(): Promise<void> {
		try {
			await this.app.fileManager.trashFile(this.file);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not delete: ${message}`);
		}
	}
}
