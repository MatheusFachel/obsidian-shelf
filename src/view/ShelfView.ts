import { ItemView, Menu, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import type { EventRef, ViewStateResult } from 'obsidian';
import { SHELF_VIEW_ICON, SHELF_VIEW_LABEL, SHELF_VIEW_TYPE } from '../constants';
import { AddFolderModal } from '../modals/AddFolderModal';
import { CollectionModal, DeleteCollectionModal } from '../modals/CollectionModal';
import { openQuickNote } from '../modals/QuickNoteFolderModal';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf, ShelfCollection } from '../types';
import { ShelfBar } from './ShelfBar';
import { ShelfTree } from './ShelfTree';
import { openShelfCollectionGallery } from './openShelfGallery';

/**
 * The main Shelf sidebar view.
 *
 * Composition:
 *   - Top: `ShelfBar` — horizontal row of shelf icons + the "+" button.
 *   - Below: header with the active shelf's name and action button.
 *   - Below that: tree of folders/files for the active shelf.
 *
 * The view subscribes to `ShelfManager` on open and unsubscribes on close, so
 * any mutation to the underlying data triggers a full re-render.
 */
export class ShelfView extends ItemView {
	/** Function returned by `ShelfManager.subscribe`; called to detach the listener. */
	private unsubscribe: (() => void) | null = null;

	private readonly shelfBar: ShelfBar;
	private readonly shelfTree: ShelfTree;
	private readonly scrollTopByShelf = new Map<string, number>();
	private renderedShelfId: string | null = null;
	private readonly vaultEvents: EventRef[] = [];
	private metadataEvent: EventRef | null = null;
	private dynamicTimer: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly shelfManager: ShelfManager,
	) {
		super(leaf);
		this.shelfTree = new ShelfTree(this.app, this.shelfManager, () => {
			void this.app.workspace.requestSaveLayout();
		});
		this.shelfBar = new ShelfBar(this.app, this.shelfManager, (id) => {
			if (this.unsubscribe === null || this.shelfManager.getActiveShelfId() !== id) return;
			if (!this.shelfTree.focusFirst()) {
				this.contentEl.querySelector<HTMLElement>('.shelf-view-header-action')?.focus();
			}
		});
	}

	// --- ItemView identity (required) --------------------------------------

	getViewType(): string {
		return SHELF_VIEW_TYPE;
	}

	getDisplayText(): string {
		return SHELF_VIEW_LABEL;
	}

	getIcon(): string {
		return SHELF_VIEW_ICON;
	}

	getState(): Record<string, unknown> {
		return { navigation: this.shelfTree.getNavigationState() };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const navigation = typeof state === 'object' && state !== null && 'navigation' in state
			? state.navigation : null;
		this.shelfTree.setNavigationState(navigation);
		await super.setState(state, result);
		this.render();
	}

	/** Show the destination folder and new note after a command creates one. */
	revealFolder(path: string): void {
		this.shelfTree.expandFolder(path);
	}

	// --- Lifecycle ---------------------------------------------------------

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.addClass('shelf-view');

		this.unsubscribe = this.shelfManager.subscribe(() => {
			this.render();
		});
		this.metadataEvent = this.app.metadataCache.on('changed', () => this.scheduleDynamicRender());
		this.vaultEvents.push(this.app.vault.on('create', (file) => {
			if (file instanceof TFile && file.extension.toLowerCase() === 'md') this.scheduleDynamicRender();
		}));
		this.vaultEvents.push(this.app.vault.on('rename', (file, oldPath) => {
			this.shelfTree.remapPath(oldPath, file.path);
			this.scheduleDynamicRender();
		}));
		this.vaultEvents.push(this.app.vault.on('delete', (file) => {
			this.shelfTree.dropPath(file.path);
			this.scheduleDynamicRender();
		}));

		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		if (this.metadataEvent) this.app.metadataCache.offref(this.metadataEvent);
		this.metadataEvent = null;
		for (const event of this.vaultEvents) this.app.vault.offref(event);
		this.vaultEvents.length = 0;
		if (this.dynamicTimer !== null) window.clearTimeout(this.dynamicTimer);
		this.dynamicTimer = null;
	}

	private scheduleDynamicRender(): void {
		if (this.shelfManager.getActiveShelf()?.kind !== 'tag') return;
		if (this.dynamicTimer !== null) window.clearTimeout(this.dynamicTimer);
		this.dynamicTimer = window.setTimeout(() => {
			this.dynamicTimer = null;
			this.render();
		}, 200);
	}

	// --- Rendering ---------------------------------------------------------

	private render(): void {
		const root = this.contentEl;
		if (this.renderedShelfId !== null) {
			this.scrollTopByShelf.set(this.renderedShelfId, root.scrollTop);
		}

		const shelves = this.shelfManager.getAllShelves();
		const activeShelf = shelves.length > 0 ? this.shelfManager.getActiveShelf() : null;
		const nextShelfId = activeShelf?.id ?? null;
		const scrollTop = nextShelfId === null ? 0 : this.scrollTopByShelf.get(nextShelfId) ?? 0;
		const focusedTreePath = this.renderedShelfId === nextShelfId
			? this.shelfTree.getFocusedPath()
			: null;

		root.empty();

		// The bar is always present — even on an empty vault it shows the "+".
		this.shelfBar.render(root);

		if (shelves.length === 0) {
			this.renderEmptyState(root);
		} else if (activeShelf) {
			this.renderHeader(root, activeShelf);
			this.shelfTree.render(root, activeShelf);
			this.renderCollections(root, activeShelf);
		}

		this.renderedShelfId = nextShelfId;
		root.scrollTop = scrollTop;
		if (focusedTreePath !== null) this.shelfTree.focusPath(focusedTreePath);
		else if (nextShelfId && !this.scrollTopByShelf.has(nextShelfId)) this.shelfTree.scrollToSavedFocus();
	}

	private renderHeader(root: HTMLElement, shelf: Shelf): void {
		const header = root.createDiv({ cls: 'shelf-view-header' });
		header.createEl('h3', {
			text: shelf.name,
			cls: 'shelf-view-header-title',
		});

		if (shelf.kind === 'tag') {
			header.createSpan({ text: shelf.tag ?? '', cls: 'shelf-view-header-tag' });
			return;
		}
		const actions = header.createDiv({ cls: 'shelf-view-header-actions' });
		const addBtn = actions.createEl('button', {
			cls: 'shelf-view-header-action',
			attr: {
				type: 'button',
				'aria-label': 'Add folder to shelf',
				title: 'Add folder to shelf',
			},
		});
		const iconEl = addBtn.createSpan();
		setIcon(iconEl, 'folder-plus');

		addBtn.addEventListener('click', () => {
			new AddFolderModal(this.app, this.shelfManager, shelf).open();
		});

		const quickBtn = actions.createEl('button', {
			cls: 'shelf-view-header-action',
			attr: {
				type: 'button',
				'aria-label': 'Quick note in shelf',
				title: 'Quick note in shelf',
			},
		});
		setIcon(quickBtn, 'file-plus');
		quickBtn.addEventListener('click', () => {
			openQuickNote(this.app, this.shelfManager, (path) => this.revealFolder(path));
		});
	}

	private renderCollections(root: HTMLElement, shelf: Shelf): void {
		const section = root.createDiv({ cls: 'shelf-collections' });
		const heading = section.createDiv({ cls: 'shelf-collections-heading' });
		heading.createSpan({ text: 'Collections' });
		const add = heading.createEl('button', {
			cls: 'shelf-view-header-action',
			attr: { type: 'button', 'aria-label': 'New collection', title: 'New collection' },
		});
		setIcon(add, 'plus');
		add.addEventListener('click', () => new CollectionModal(this.app, this.shelfManager, shelf).open());
		for (const collection of shelf.collections) {
			const button = section.createEl('button', {
				cls: 'shelf-collection-item',
				text: `${collection.name} (${collection.files.length})`,
				attr: { type: 'button' },
			});
			button.addEventListener('click', () => {
				void openShelfCollectionGallery(this.app, shelf.id, collection.id);
			});
			button.addEventListener('contextmenu', (event) => {
				event.preventDefault();
				this.showCollectionMenu(shelf, collection, button, event);
			});
			button.addEventListener('keydown', (event) => {
				if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
				event.preventDefault();
				this.showCollectionMenu(shelf, collection, button);
			});
		}
	}

	private showCollectionMenu(
		shelf: Shelf, collection: ShelfCollection, button: HTMLElement, event?: MouseEvent,
	): void {
		const menu = new Menu();
		menu.addItem((item) => item.setTitle('Rename collection').setIcon('pencil').onClick(() => {
			new CollectionModal(this.app, this.shelfManager, shelf, collection).open();
		}));
		menu.addItem((item) => item.setTitle('Delete collection').setIcon('trash-2').setWarning(true).onClick(() => {
			new DeleteCollectionModal(this.app, this.shelfManager, shelf, collection).open();
		}));
		if (event) menu.showAtMouseEvent(event);
		else {
			const rect = button.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom }, button.ownerDocument);
		}
	}

	private renderEmptyState(root: HTMLElement): void {
		const wrapper = root.createDiv({ cls: 'shelf-view-empty' });
		wrapper.createEl('p', {
			text: 'No shelves yet.',
			cls: 'shelf-view-empty-title',
		});
		wrapper.createEl('p', {
			text: 'Click the "+" button above to create your first shelf.',
			cls: 'shelf-view-empty-hint',
		});
	}

}
