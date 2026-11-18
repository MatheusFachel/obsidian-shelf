import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import { SHELF_VIEW_ICON, SHELF_VIEW_LABEL, SHELF_VIEW_TYPE } from '../constants';
import { AddFolderModal } from '../modals/AddFolderModal';
import { openQuickNote } from '../modals/QuickNoteFolderModal';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';
import { ShelfBar } from './ShelfBar';
import { ShelfTree } from './ShelfTree';

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

	constructor(
		leaf: WorkspaceLeaf,
		private readonly shelfManager: ShelfManager,
	) {
		super(leaf);
		this.shelfTree = new ShelfTree(this.app, this.shelfManager);
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

		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
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
		}

		this.renderedShelfId = nextShelfId;
		root.scrollTop = scrollTop;
		if (focusedTreePath !== null) this.shelfTree.focusPath(focusedTreePath);
	}

	private renderHeader(root: HTMLElement, shelf: Shelf): void {
		const header = root.createDiv({ cls: 'shelf-view-header' });
		header.createEl('h3', {
			text: shelf.name,
			cls: 'shelf-view-header-title',
		});

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
