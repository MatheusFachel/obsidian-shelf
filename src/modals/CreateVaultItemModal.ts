import { App, Modal, normalizePath, Notice, Setting, TAbstractFile, TFile, TFolder } from 'obsidian';

type ItemKind = 'note' | 'folder';

/** Create a Markdown note or subfolder inside a folder shown by Shelf. */
export class CreateVaultItemModal extends Modal {
	private name = '';
	private creating = false;

	constructor(
		app: App,
		private readonly folder: TFolder,
		private readonly kind: ItemKind,
		private readonly onCreated: (item: TAbstractFile) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.setTitle(this.kind === 'note' ? 'New note' : 'New folder');
		this.contentEl.createEl('p', { text: `Create inside “${this.folder.path}”.` });

		new Setting(this.contentEl)
			.setName(this.kind === 'note' ? 'Note name' : 'Folder name')
			.addText((text) => {
				text.setPlaceholder(this.kind === 'note' ? 'Note name' : 'Folder name')
					.setValue(this.name)
					.onChange((value) => { this.name = value; });
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					void this.createItem();
				});
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		new Setting(this.contentEl)
			.addButton((button) => {
				button.setButtonText('Cancel').onClick(() => this.close());
			})
			.addButton((button) => {
				button.setButtonText('Create').setCta().onClick(() => {
					void this.createItem();
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async createItem(): Promise<void> {
		if (this.creating) return;
		const name = this.name.trim();
		const invalidCharacter = /[\\/:*?"<>|]/.test(name) ||
			[...name].some((character) => character.charCodeAt(0) < 32);
		if (!name || name === '.' || name === '..' || name.toLowerCase() === '.md' ||
			invalidCharacter || name.endsWith('.')) {
			new Notice('Enter a name without slashes or special path characters.');
			return;
		}
		const fileName = this.kind === 'note'
			? `${name.toLowerCase().endsWith('.md') ? name.slice(0, -3) : name}.md`
			: name;
		const path = normalizePath(`${this.folder.path}/${fileName}`);
		if (this.app.vault.getAbstractFileByPath(this.folder.path) !== this.folder) {
			new Notice('This folder no longer exists in the vault.');
			return;
		}
		if (this.app.vault.getAbstractFileByPath(path)) {
			new Notice(`A file or folder already exists at “${path}”.`);
			return;
		}

		this.creating = true;
		let created: TFile | TFolder;
		try {
			created = this.kind === 'note'
				? await this.app.vault.create(path, '')
				: await this.app.vault.createFolder(path);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not create ${this.kind}: ${message}`);
			this.creating = false;
			return;
		}

		this.onCreated(created);
		this.close();
		if (created instanceof TFile) {
			try {
				await this.app.workspace.getLeaf().openFile(created);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`Note created, but could not open it: ${message}`);
			}
		}
		this.creating = false;
	}
}
