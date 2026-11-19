import { App, FuzzySuggestModal, Modal, normalizePath, Notice, Setting, TAbstractFile, TFolder } from 'obsidian';
import type { Shelf } from '../types';

/** Pick a destination within the active shelf, then confirm the resulting path. */
export class MoveVaultItemModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly file: TAbstractFile,
		private readonly shelf: Shelf,
		private readonly onMoved: (destinationPath: string) => void,
	) {
		super(app);
		this.setPlaceholder(`Move “${file.name}” to a folder in “${shelf.name}”…`);
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		for (const root of this.shelf.folders) {
			const folder = this.app.vault.getAbstractFileByPath(root.path);
			if (folder instanceof TFolder) this.collect(folder, folders);
		}
		return folders.sort((a, b) => a.path.localeCompare(b.path));
	}

	private collect(folder: TFolder, result: TFolder[]): void {
		if (folder.path === this.file.path || folder.path.startsWith(this.file.path + '/')) return;
		if (folder.path !== this.file.parent?.path) result.push(folder);
		for (const child of folder.children) {
			if (child instanceof TFolder) this.collect(child, result);
		}
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		new ConfirmMoveModal(this.app, this.file, folder, this.onMoved).open();
	}
}

class ConfirmMoveModal extends Modal {
	private moving = false;

	constructor(
		app: App,
		private readonly file: TAbstractFile,
		private readonly destination: TFolder,
		private readonly onMoved: (destinationPath: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.setTitle('Move file or folder');
		const nextPath = normalizePath(`${this.destination.path}/${this.file.name}`);
		this.contentEl.createEl('p', { text: `From: ${this.file.path}` });
		this.contentEl.createEl('p', { text: `To: ${nextPath}` });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) => button.setButtonText('Move').setCta().onClick(() => {
				if (this.moving) return;
				this.moving = true;
				button.setDisabled(true);
				void this.move().finally(() => {
					this.moving = false;
					button.setDisabled(false);
				});
			}));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async move(): Promise<void> {
		const nextPath = normalizePath(`${this.destination.path}/${this.file.name}`);
		if (this.app.vault.getAbstractFileByPath(this.file.path) !== this.file ||
			this.app.vault.getAbstractFileByPath(this.destination.path) !== this.destination) {
			new Notice('The source or destination no longer exists.');
			return;
		}
		if (this.destination.path === this.file.path ||
			this.destination.path.startsWith(this.file.path + '/')) {
			new Notice('A folder cannot be moved inside itself.');
			return;
		}
		if (this.app.vault.getAbstractFileByPath(nextPath)) {
			new Notice(`A file or folder already exists at “${nextPath}”.`);
			return;
		}
		try {
			await this.app.fileManager.renameFile(this.file, nextPath);
			this.onMoved(this.destination.path);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not move: ${message}`);
		}
	}
}
