import { ItemView, Menu, Notice, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type { EventRef, ViewStateResult } from 'obsidian';
import { SHELF_GALLERY_VIEW_TYPE } from '../constants';
import { DeleteFileModal } from '../modals/DeleteFileModal';
import { RenameFileModal } from '../modals/RenameFileModal';
import { AddImageToCollectionModal } from '../modals/AddImageToCollectionModal';
import type { ShelfManager } from '../services/ShelfManager';
import { GalleryLightbox } from './GalleryLightbox';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
const MENU_SOURCE = 'shelf-gallery-context-menu';

function isImage(file: TFile): boolean {
	return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

function isImagePath(path: string): boolean {
	return IMAGE_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '');
}

function parentPath(path: string): string {
	return path.substring(0, path.lastIndexOf('/'));
}

/** Visual tab for files directly inside a folder selected in Shelf's tree. */
export class ShelfGalleryView extends ItemView {
	private folderPath: string | null = null;
	private shelfId: string | null = null;
	private collectionId: string | null = null;
	private includeSubfolders = false;
	private query = '';
	private files: TFile[] = [];
	private unsubscribe: (() => void) | null = null;
	private readonly vaultEvents: EventRef[] = [];
	private refreshTimer: number | null = null;
	private renderFrame: number | null = null;
	private lightbox: GalleryLightbox | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly shelfManager: ShelfManager) {
		super(leaf);
	}

	getViewType(): string {
		return SHELF_GALLERY_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.shelfId && this.collectionId) {
			return this.shelfManager.getCollection(this.shelfId, this.collectionId)?.name ?? 'Collection';
		}
		return this.folderPath ? this.folderPath.split('/').join(' › ') : 'Gallery';
	}

	getIcon(): string {
		return 'image';
	}

	getState(): Record<string, unknown> {
		return {
			folderPath: this.folderPath,
			shelfId: this.shelfId,
			collectionId: this.collectionId,
			includeSubfolders: this.includeSubfolders,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const path = typeof state === 'object' && state !== null && 'folderPath' in state
			? state.folderPath : null;
		this.folderPath = typeof path === 'string' && path ? path : null;
		this.shelfId = typeof state === 'object' && state !== null && 'shelfId' in state &&
			typeof state.shelfId === 'string' ? state.shelfId : null;
		this.collectionId = typeof state === 'object' && state !== null && 'collectionId' in state &&
			typeof state.collectionId === 'string' ? state.collectionId : null;
		this.includeSubfolders = typeof state === 'object' && state !== null && 'includeSubfolders' in state &&
			state.includeSubfolders === true;
		this.query = '';
		await super.setState(state, result);
		this.render();
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('shelf-gallery-view');
		this.unsubscribe = this.shelfManager.subscribe((kind) => {
			if (kind === 'data') {
				if (this.collectionId) this.lightbox?.close();
				this.scheduleRender();
			}
		});
		this.vaultEvents.push(this.app.vault.on('create', (file) => {
			if (file instanceof TFile && isImage(file) && this.isRelevantImage(file.path)) {
				this.scheduleRender();
			}
		}));
		this.vaultEvents.push(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && isImage(file) && this.isRelevantImage(file.path)) {
				this.scheduleRender();
			}
		}));
		this.vaultEvents.push(this.app.vault.on('rename', (file, oldPath) => {
			const previousFolderPath = this.folderPath;
			const folderMoved = file instanceof TFolder && previousFolderPath !== null &&
				(previousFolderPath === oldPath || previousFolderPath.startsWith(oldPath + '/'));
			const imageMoved = file instanceof TFile &&
				((isImagePath(oldPath) && this.isRelevantImage(oldPath)) ||
					(isImage(file) && this.isRelevantImage(file.path)));
			const nestedFolderMoved = file instanceof TFolder && previousFolderPath !== null &&
				this.includeSubfolders && (oldPath.startsWith(previousFolderPath + '/') ||
					file.path.startsWith(previousFolderPath + '/'));
			if (folderMoved || imageMoved || nestedFolderMoved) {
				this.lightbox?.close();
			}
			if (folderMoved && this.folderPath) {
				this.folderPath = file.path + this.folderPath.slice(oldPath.length);
				void this.app.workspace.requestSaveLayout();
			}
			if (folderMoved || imageMoved || nestedFolderMoved) {
				this.scheduleRender();
			}
		}));
		this.vaultEvents.push(this.app.vault.on('delete', (file) => {
			const folderRemoved = file instanceof TFolder && this.folderPath !== null &&
				(file.path === this.folderPath || this.folderPath.startsWith(file.path + '/') ||
					(this.includeSubfolders && file.path.startsWith(this.folderPath + '/')));
			const imageRemoved = file instanceof TFile && isImage(file) && this.isRelevantImage(file.path);
			if (folderRemoved || imageRemoved) {
				this.lightbox?.close();
				this.scheduleRender();
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
		if (this.renderFrame !== null) window.cancelAnimationFrame(this.renderFrame);
		this.renderFrame = null;
		this.lightbox?.close();
		this.lightbox = null;
		this.contentEl.empty();
	}

	private isRelevantImage(path: string): boolean {
		if (this.shelfId && this.collectionId) {
			return this.shelfManager.getCollection(this.shelfId, this.collectionId)?.files.includes(path) ?? false;
		}
		if (!this.folderPath) return false;
		return this.includeSubfolders
			? path.startsWith(this.folderPath + '/')
			: parentPath(path) === this.folderPath;
	}

	private scheduleRender(): void {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.render();
		}, 120);
	}

	private render(): void {
		if (this.renderFrame !== null) window.cancelAnimationFrame(this.renderFrame);
		this.renderFrame = null;
		const scrollTop = this.contentEl.querySelector<HTMLElement>('.shelf-gallery-grid')?.scrollTop ?? 0;
		const previousSearch = this.contentEl.querySelector<HTMLInputElement>('.shelf-gallery-search');
		const searchFocused = this.contentEl.ownerDocument.activeElement === previousSearch;
		const cursor = searchFocused ? previousSearch?.selectionStart : null;
		this.contentEl.empty();
		const collection = this.shelfId && this.collectionId
			? this.shelfManager.getCollection(this.shelfId, this.collectionId) : null;
		const source = this.folderPath ? this.app.vault.getAbstractFileByPath(this.folderPath) : null;
		const folder = source instanceof TFolder ? source : null;
		if (!collection && !folder) {
			this.lightbox?.close();
			this.contentEl.createEl('p', {
				cls: 'shelf-gallery-empty',
				text: this.collectionId ? 'Collection not found.' :
					this.folderPath ? 'Folder not found.' : 'Choose a folder in Shelf to open its gallery.',
			});
			return;
		}

		const header = this.contentEl.createDiv({ cls: 'shelf-gallery-header' });
		const heading = header.createDiv({ cls: 'shelf-gallery-heading' });
		if (folder) {
			const ancestors = folder.path.split('/').slice(0, -1);
			if (ancestors.length > 0) {
				heading.createSpan({ text: ancestors.join(' › '), cls: 'shelf-gallery-path' });
			}
		} else if (this.shelfId) {
			const shelf = this.shelfManager.getShelf(this.shelfId);
			if (shelf) heading.createSpan({ text: shelf.name, cls: 'shelf-gallery-path' });
		}
		heading.createEl('h2', { text: collection?.name ?? folder?.name ?? 'Gallery', cls: 'shelf-gallery-title' });
		if (folder) {
			const toggle = header.createEl('label', { cls: 'shelf-gallery-recursive-toggle' });
			const checkbox = toggle.createEl('input', { attr: { type: 'checkbox' } });
			checkbox.checked = this.includeSubfolders;
			toggle.createSpan({ text: 'Include subfolders' });
			checkbox.addEventListener('change', () => {
				this.includeSubfolders = checkbox.checked;
				void this.app.workspace.requestSaveLayout();
				this.render();
			});
		}
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

		const missing: string[] = [];
		if (collection) {
			this.files = [];
			for (const path of collection.files) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile && isImage(file)) this.files.push(file);
				else missing.push(path);
			}
		} else if (folder) {
			this.files = this.collectImages(folder);
		}
		if (this.files.length === 0 && missing.length === 0) {
			this.lightbox?.close();
			this.contentEl.createEl('p', {
				cls: 'shelf-gallery-empty',
				text: collection ? 'No images in this collection.' : 'No images in this folder.',
			});
			return;
		}

		const grid = this.contentEl.createDiv({ cls: 'shelf-gallery-grid' });
		grid.style.setProperty('--shelf-gallery-size', `${this.shelfManager.getSettings().galleryThumbnailSize}px`);
		const noResults = grid.createEl('p', {
			cls: 'shelf-gallery-no-results', text: 'No images match this search.',
		});
		noResults.hidden = true;
		let index = 0;
		let restoringScroll = scrollTop > 0;
		const renderBatch = (): void => {
			this.renderFrame = null;
			const end = Math.min(index + 100, this.files.length);
			for (; index < end; index++) {
				const file = this.files[index];
				if (file) this.renderCard(grid, file);
			}
			if (index < this.files.length) {
				this.renderFrame = window.requestAnimationFrame(renderBatch);
			} else if (collection && this.shelfId && this.collectionId) {
				for (const path of missing) this.renderMissingCard(grid, path, this.shelfId, this.collectionId);
			}
			this.filterCards();
			if (restoringScroll) {
				grid.scrollTop = scrollTop;
				restoringScroll = grid.scrollTop < scrollTop && this.renderFrame !== null;
			}
		};
		renderBatch();
	}

	private collectImages(folder: TFolder): TFile[] {
		const result: TFile[] = [];
		const pending = [folder];
		while (pending.length > 0) {
			const current = pending.pop();
			if (!current) continue;
			for (const child of current.children) {
				if (child instanceof TFile && isImage(child)) result.push(child);
				else if (this.includeSubfolders && child instanceof TFolder) pending.push(child);
			}
		}
		return result.sort((a, b) => a.path.localeCompare(b.path));
	}

	private renderMissingCard(grid: HTMLElement, path: string, shelfId: string, collectionId: string): void {
		const card = grid.createDiv({ cls: 'shelf-gallery-missing-card' });
		card.dataset.filename = path.split('/').pop()?.toLocaleLowerCase() ?? '';
		card.createSpan({ text: `${path} (missing)`, cls: 'shelf-gallery-missing-name' });
		const remove = card.createEl('button', { text: 'Remove reference', attr: { type: 'button' } });
		remove.addEventListener('click', () => {
			void this.shelfManager.removeFileFromCollection(shelfId, collectionId, path).catch((error: unknown) => {
				new Notice(error instanceof Error ? error.message : String(error));
			});
		});
	}

	private renderCard(grid: HTMLElement, file: TFile): void {
		const card = grid.createEl('button', {
			cls: 'shelf-gallery-card',
			attr: { type: 'button', 'aria-label': `Open ${file.name}` },
		});
		card.dataset.path = file.path;
		card.dataset.filename = file.name.toLocaleLowerCase();
		const preview = card.createDiv({ cls: 'shelf-gallery-preview' });
		const image = preview.createEl('img');
		image.src = this.app.vault.getResourcePath(file);
		image.alt = '';
		image.loading = 'lazy';
		const label = card.createSpan({ cls: 'shelf-gallery-filename' });
		label.createSpan({ text: file.name });
		if (this.collectionId || this.includeSubfolders) {
			const parent = file.parent?.path ?? '';
			const origin = this.folderPath && parent.startsWith(this.folderPath + '/')
				? parent.slice(this.folderPath.length + 1) : parent === this.folderPath ? '' : parent;
			if (origin) label.createEl('small', { text: origin, cls: 'shelf-gallery-origin' });
		}
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
		for (const card of Array.from(this.contentEl.querySelectorAll<HTMLElement>(
			'.shelf-gallery-card, .shelf-gallery-missing-card',
		))) {
			card.hidden = !(card.dataset.filename ?? '').includes(query);
			if (!card.hidden) visible++;
		}
		const noResults = this.contentEl.querySelector<HTMLElement>('.shelf-gallery-no-results');
		if (noResults) noResults.hidden = visible > 0 || this.renderFrame !== null;
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
			() => {
				this.lightbox = null;
				const card = Array.from(this.contentEl.querySelectorAll<HTMLButtonElement>('.shelf-gallery-card'))
					.find((candidate) => candidate.dataset.path === file.path);
				card?.focus();
			},
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
		if (this.shelfManager.getAllShelves().some((shelf) => shelf.collections.length > 0)) {
			menu.addItem((item) => item.setTitle('Add to collection…').setIcon('images').onClick(() => {
				new AddImageToCollectionModal(this.app, this.shelfManager, file).open();
			}));
		}
		if (this.shelfId && this.collectionId) {
			const shelfId = this.shelfId;
			const collectionId = this.collectionId;
			menu.addItem((item) => item.setTitle('Remove from collection').setIcon('x').onClick(() => {
				void this.shelfManager.removeFileFromCollection(shelfId, collectionId, file.path).catch(
					(error: unknown) => new Notice(error instanceof Error ? error.message : String(error)),
				);
			}));
		}
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
