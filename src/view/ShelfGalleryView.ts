import { ItemView, Menu, Notice, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type { EventRef, ViewStateResult } from 'obsidian';
import { SHELF_GALLERY_VIEW_TYPE } from '../constants';
import { DeleteFileModal } from '../modals/DeleteFileModal';
import { RenameFileModal } from '../modals/RenameFileModal';
import type { ShelfManager } from '../services/ShelfManager';
import { GalleryLightbox } from './GalleryLightbox';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
const MENU_SOURCE = 'shelf-gallery-context-menu';

function isImage(file: TFile): boolean {
	return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

/** Visual tab for files directly inside a folder selected in Shelf's tree. */
export class ShelfGalleryView extends ItemView {
	private folderPath: string | null = null;
	private query = '';
	private files: TFile[] = [];
	private unsubscribe: (() => void) | null = null;
	private readonly vaultEvents: EventRef[] = [];
	private refreshTimer: number | null = null;
	private lightbox: GalleryLightbox | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly shelfManager: ShelfManager) {
		super(leaf);
	}

	getViewType(): string {
		return SHELF_GALLERY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.folderPath ? this.folderPath.split('/').join(' › ') : 'Gallery';
	}

	getIcon(): string {
		return 'image';
	}

	getState(): Record<string, unknown> {
		return { folderPath: this.folderPath };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const path = typeof state === 'object' && state !== null && 'folderPath' in state
			? state.folderPath : null;
		this.folderPath = typeof path === 'string' && path ? path : null;
		this.query = '';
		await super.setState(state, result);
		this.render();
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('shelf-gallery-view');
		this.unsubscribe = this.shelfManager.subscribe(() => this.scheduleRender());
		this.vaultEvents.push(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.parent?.path === this.folderPath) {
				this.scheduleRender();
			}
		}));
		this.vaultEvents.push(this.app.vault.on('rename', (file, oldPath) => {
			const previousFolderPath = this.folderPath;
			if (previousFolderPath &&
				(oldPath === previousFolderPath || oldPath.startsWith(`${previousFolderPath}/`) ||
				previousFolderPath.startsWith(`${oldPath}/`))) {
				this.lightbox?.close();
			}
			if (file instanceof TFolder && this.folderPath &&
				(this.folderPath === oldPath || this.folderPath.startsWith(oldPath + '/'))) {
				this.folderPath = file.path + this.folderPath.slice(oldPath.length);
			}
			this.scheduleRender();
		}));
		this.vaultEvents.push(this.app.vault.on('delete', (file) => {
			if (this.folderPath &&
				(file.path === this.folderPath || file.path.startsWith(`${this.folderPath}/`) ||
				this.folderPath.startsWith(`${file.path}/`))) {
				this.lightbox?.close();
			}
		}));
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		for (const event of this.vaultEvents) this.app.vault.offref(event);
		this.vaultEvents.length = 0;
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = null;
		this.lightbox?.close();
		this.lightbox = null;
		this.contentEl.empty();
	}

	private scheduleRender(): void {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.render();
		}, 120);
	}

	private render(): void {
		const scrollTop = this.contentEl.querySelector<HTMLElement>('.shelf-gallery-grid')?.scrollTop ?? 0;
		const previousSearch = this.contentEl.querySelector<HTMLInputElement>('.shelf-gallery-search');
		const searchFocused = this.contentEl.ownerDocument.activeElement === previousSearch;
		const cursor = searchFocused ? previousSearch?.selectionStart : null;
		this.contentEl.empty();
		const folder = this.folderPath
			? this.app.vault.getAbstractFileByPath(this.folderPath) : null;
		if (!(folder instanceof TFolder)) {
			this.lightbox?.close();
			this.contentEl.createEl('p', {
				cls: 'shelf-gallery-empty',
				text: this.folderPath ? 'Folder not found.' : 'Choose a folder in Shelf to open its gallery.',
			});
			return;
		}

		const header = this.contentEl.createDiv({ cls: 'shelf-gallery-header' });
		const heading = header.createDiv({ cls: 'shelf-gallery-heading' });
		const ancestors = folder.path.split('/').slice(0, -1);
		if (ancestors.length > 0) {
			heading.createSpan({ text: ancestors.join(' › '), cls: 'shelf-gallery-path' });
		}
		heading.createEl('h2', { text: folder.name, cls: 'shelf-gallery-title' });
		const search = header.createEl('input', {
			cls: 'shelf-gallery-search',
			attr: { type: 'search', placeholder: 'Search images by name', 'aria-label': 'Search gallery images' },
		});
		search.value = this.query;
		if (searchFocused) {
			search.focus();
			if (cursor !== null && cursor !== undefined) search.setSelectionRange(cursor, cursor);
		}
		search.addEventListener('input', () => {
			this.query = search.value;
			this.filterCards();
		});

		this.files = folder.children
			.filter((file): file is TFile => file instanceof TFile && isImage(file))
			.sort((a, b) => a.name.localeCompare(b.name));
		if (this.files.length === 0) {
			this.lightbox?.close();
			this.contentEl.createEl('p', { cls: 'shelf-gallery-empty', text: 'No images in this folder.' });
			return;
		}

		const grid = this.contentEl.createDiv({ cls: 'shelf-gallery-grid' });
		grid.style.setProperty('--shelf-gallery-size', `${this.shelfManager.getSettings().galleryThumbnailSize}px`);
		for (const file of this.files) this.renderCard(grid, file);
		grid.createEl('p', { cls: 'shelf-gallery-no-results', text: 'No images match this search.' });
		this.filterCards();
		grid.scrollTop = scrollTop;
	}

	private renderCard(grid: HTMLElement, file: TFile): void {
		const card = grid.createEl('button', {
			cls: 'shelf-gallery-card',
			attr: { type: 'button', 'aria-label': `Open ${file.name}` },
		});
		card.dataset.filename = file.name.toLocaleLowerCase();
		const preview = card.createDiv({ cls: 'shelf-gallery-preview' });
		const image = preview.createEl('img');
		image.src = this.app.vault.getResourcePath(file);
		image.alt = '';
		image.loading = 'lazy';
		card.createSpan({ text: file.name, cls: 'shelf-gallery-filename' });
		card.addEventListener('click', () => {
			if (this.shelfManager.getSettings().galleryClickToZoom) {
				this.openLightbox(file);
			} else {
				void this.app.workspace.getLeaf().openFile(file);
			}
		});
		card.addEventListener('contextmenu', (event) => this.showFileMenu(file, event));
	}

	private filterCards(): void {
		const query = this.query.trim().toLocaleLowerCase();
		let visible = 0;
		for (const card of Array.from(this.contentEl.querySelectorAll<HTMLElement>('.shelf-gallery-card'))) {
			card.hidden = !(card.dataset.filename ?? '').includes(query);
			if (!card.hidden) visible++;
		}
		const noResults = this.contentEl.querySelector<HTMLElement>('.shelf-gallery-no-results');
		if (noResults) noResults.hidden = visible > 0;
	}

	private openLightbox(file: TFile): void {
		const query = this.query.trim().toLocaleLowerCase();
		const images = this.files.filter((candidate) => candidate.name.toLocaleLowerCase().includes(query));
		const index = images.findIndex((candidate) => candidate.path === file.path);
		if (index < 0) return;
		this.lightbox?.close();
		this.lightbox = new GalleryLightbox(
			this.app, this.contentEl, images, index,
			(current, event) => this.showFileMenu(current, event),
			() => { this.lightbox = null; },
		);
	}

	private showFileMenu(file: TFile, event: MouseEvent): void {
		event.preventDefault();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle('Open in new tab').setIcon('file-plus').onClick(() => {
			void this.app.workspace.getLeaf('tab').openFile(file);
		}));
		menu.addItem((item) => item.setTitle('Copy vault path').setIcon('copy').onClick(() => {
			void navigator.clipboard.writeText(file.path).catch(() => new Notice('Could not copy path.'));
		}));
		menu.addSeparator();
		menu.addItem((item) => item.setTitle('Rename…').setIcon('pencil').onClick(() => {
			new RenameFileModal(this.app, file).open();
		}));
		menu.addItem((item) => item.setTitle('Delete').setIcon('trash-2').setWarning(true).onClick(() => {
			new DeleteFileModal(this.app, file).open();
		}));
		menu.addSeparator();
		this.app.workspace.trigger('file-menu', menu, file, MENU_SOURCE);
		menu.showAtMouseEvent(event);
	}

}
