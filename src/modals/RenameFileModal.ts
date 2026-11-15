import { App, Modal, normalizePath, Notice, Setting, TAbstractFile, TFile } from 'obsidian';

/** Rename a file or folder through Obsidian's public FileManager API. */
export class RenameFileModal extends Modal {
	private name: string;
	private renaming = false;

	constructor(app: App, private readonly file: TAbstractFile) {
		super(app);
		this.name = file.name;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('Rename');

		new Setting(contentEl)
			.setName('New name')
			.addText((text) => {
				text.setValue(this.name).onChange((value) => {
					this.name = value;
				});
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void this.renameFile();
					}
				});
				window.setTimeout(() => {
					text.inputEl.focus();
					const selectedLength = this.file instanceof TFile
						? this.file.basename.length
						: this.file.name.length;
					text.inputEl.setSelectionRange(0, selectedLength);
				}, 0);
			});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('Cancel').onClick(() => this.close());
			})
			.addButton((button) => {
				button
					.setButtonText('Rename')
					.setCta()
					.onClick(() => {
						void this.renameFile();
					});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async renameFile(): Promise<void> {
		if (this.renaming) return;
		const name = this.name.trim();
		if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) {
			new Notice('Enter a name without slashes.');
			return;
		}

		const parentPath = this.file.parent?.path ?? '';
		const newPath = normalizePath(parentPath ? `${parentPath}/${name}` : name);
		if (newPath === this.file.path) {
			this.close();
			return;
		}
		const existing = this.app.vault.getAbstractFileByPath(newPath);
		if (existing && existing !== this.file) {
			new Notice(`A file or folder already exists at "${newPath}".`);
			return;
		}

		this.renaming = true;
		try {
			await this.app.fileManager.renameFile(this.file, newPath);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not rename: ${message}`);
		} finally {
			this.renaming = false;
		}
	}
}
