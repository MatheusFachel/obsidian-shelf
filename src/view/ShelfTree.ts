import { App, getAllTags, Menu, Notice, setIcon, TAbstractFile, TFile, TFolder } from 'obsidian';
import { CreateVaultItemModal } from '../modals/CreateVaultItemModal';
import { createQuickNote } from '../modals/QuickNoteFolderModal';
import { DeleteFileModal } from '../modals/DeleteFileModal';
import { RenameFileModal } from '../modals/RenameFileModal';
import { MoveVaultItemModal } from '../modals/MoveVaultItemModal';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';
import { openShelfGallery } from './openShelfGallery';

/** Source string passed to Obsidian's `file-menu` event so other plugins can identify us. */
const MENU_SOURCE = 'shelf-tree-context-menu';
const FOLDER_DRAG_TYPE = 'application/x-obsidian-shelf-folder';
const FOLDER_SHELF_TYPE = 'application/x-obsidian-shelf-folder-owner';

/**
 * Tree of folders + files for the active shelf.
 *
 * For each folder linked to the shelf, we look up the corresponding `TFolder`
 * in the vault and render it as the root of a recursive tree. Folders can be
 * expanded/collapsed; files open in the active leaf when activated. The tree
 * has one Tab stop and supports arrow-key navigation.
 *
 * Right-clicking any item opens a context menu. We delegate to Obsidian's
 * standard `file-menu` event so users get all the familiar items (Open in new
 * tab, Rename, Move, Delete, …) for free; on top of that we append our own
 * "Remove from shelf" item for top-level linked folders.
 *
 * Expand/collapse state lives in `this.expanded` (a `Set` of folder paths).
 * It persists across re-renders of the same `ShelfTree` instance, but is lost
 * when the view is closed and reopened. That's fine for the MVP.
 *
 * The tree owns its own root element so that toggling a folder only re-renders
 * the tree itself, not the surrounding bar/header.
 */
export class ShelfTree {
	private root: HTMLElement | null = null;
	private currentShelf: Shelf | null = null;
	private readonly expanded = new Set<string>();
	private readonly expandedByShelf = new Map<string, Set<string>>();
	private readonly focusedByShelf = new Map<string, string>();
	private focusedPath: string | null = null;

	constructor(
		private readonly app: App,
		private readonly shelfManager: ShelfManager,
		private readonly onNavigationChange: () => void,
	) {}

	/** First-time render: create the tree root inside `parent` and populate it. */
	render(parent: HTMLElement, shelf: Shelf): void {
		if (this.currentShelf?.id !== shelf.id) {
			this.expanded.clear();
			for (const path of this.expandedByShelf.get(shelf.id) ?? []) this.expanded.add(path);
			this.focusedPath = this.focusedByShelf.get(shelf.id) ?? null;
		}
		this.root = parent.createDiv({ cls: 'shelf-tree' });
		this.root.setAttribute('role', 'tree');
		this.root.setAttribute('aria-label', `${shelf.name} folders`);
		this.root.addEventListener('focusin', (event) => {
			const item = event.target;
			if (item instanceof HTMLElement && item.getAttribute('role') === 'treeitem') {
				this.setTabStop(item);
			}
		});
		this.root.addEventListener('keydown', (event) => this.onKeyDown(event));
		this.currentShelf = shelf;
		this.refresh();
	}

	getNavigationState(): Record<string, { expanded: string[]; focused: string | null }> {
		const result: Record<string, { expanded: string[]; focused: string | null }> = {};
		for (const [id, paths] of this.expandedByShelf) {
			result[id] = { expanded: [...paths], focused: this.focusedByShelf.get(id) ?? null };
		}
		return result;
	}

	scrollToSavedFocus(): void {
		const item = this.getVisibleItems().find((candidate) => candidate.dataset.path === this.focusedPath);
		item?.scrollIntoView({ block: 'nearest' });
	}

	setNavigationState(state: unknown): void {
		this.expandedByShelf.clear();
		this.focusedByShelf.clear();
		if (typeof state !== 'object' || state === null || Array.isArray(state)) return;
		for (const [id, value] of Object.entries(state as Record<string, unknown>)) {
			if (typeof value !== 'object' || value === null || !('expanded' in value)) continue;
			const expanded = value.expanded;
			if (!Array.isArray(expanded)) continue;
			this.expandedByShelf.set(id, new Set(expanded.filter((path): path is string => typeof path === 'string')));
			if ('focused' in value && typeof value.focused === 'string') this.focusedByShelf.set(id, value.focused);
		}
		if (this.currentShelf) {
			this.expanded.clear();
			for (const path of this.expandedByShelf.get(this.currentShelf.id) ?? []) this.expanded.add(path);
			this.focusedPath = this.focusedByShelf.get(this.currentShelf.id) ?? null;
		}
	}

	/** Keep saved expansion and focus paths valid after vault folder moves. */
	remapPath(oldPath: string, newPath: string): void {
		let changed = false;
		for (const [id, paths] of this.expandedByShelf) {
			if ([...paths].some((path) => path === oldPath || path.startsWith(oldPath + '/'))) changed = true;
			this.expandedByShelf.set(id, new Set([...paths].map((path) =>
				path === oldPath || path.startsWith(oldPath + '/')
					? newPath + path.slice(oldPath.length) : path,
			)));
		}
		for (const [id, path] of this.focusedByShelf) {
			if (path === oldPath || path.startsWith(oldPath + '/')) {
				this.focusedByShelf.set(id, newPath + path.slice(oldPath.length));
				changed = true;
			}
		}
		if (!changed) return;
		if (this.currentShelf) {
			this.expanded.clear();
			for (const path of this.expandedByShelf.get(this.currentShelf.id) ?? []) this.expanded.add(path);
			this.focusedPath = this.focusedByShelf.get(this.currentShelf.id) ?? null;
		}
		this.onNavigationChange();
	}

	dropPath(path: string): void {
		let changed = false;
		for (const [id, paths] of this.expandedByShelf) {
			if ([...paths].some((candidate) => candidate === path || candidate.startsWith(path + '/'))) changed = true;
			this.expandedByShelf.set(id, new Set([...paths].filter((candidate) =>
				candidate !== path && !candidate.startsWith(path + '/'),
			)));
		}
		for (const [id, focused] of this.focusedByShelf) {
			if (focused === path || focused.startsWith(path + '/')) {
				this.focusedByShelf.delete(id);
				changed = true;
			}
		}
		if (!changed) return;
		if (this.currentShelf) {
			this.expanded.clear();
			for (const candidate of this.expandedByShelf.get(this.currentShelf.id) ?? []) this.expanded.add(candidate);
			this.focusedPath = this.focusedByShelf.get(this.currentShelf.id) ?? null;
		}
		this.onNavigationChange();
	}

	/** Capture focus before ShelfView replaces the whole view. */
	getFocusedPath(): string | null {
		const root = this.root;
		const active = root?.ownerDocument.activeElement;
		if (!root || !(active instanceof HTMLElement) || !root.contains(active)) return null;
		return active.closest<HTMLElement>('[role="treeitem"]')?.dataset.path ?? null;
	}

	/** Restore focus after a vault change redraws the active shelf. */
	focusPath(path: string): void {
		const items = this.getVisibleItems();
		const item = items.find((candidate) => candidate.dataset.path === path) ?? items[0];
		if (item) this.focusItem(item, true);
	}

	/** Enter the tree from a shelf button, or report that the shelf is empty. */
	focusFirst(): boolean {
		const first = this.getVisibleItems()[0];
		if (!first) return false;
		this.focusItem(first);
		return true;
	}

	/** Reveal a linked folder after a quick note is created inside it. */
	expandFolder(path: string): void {
		this.expandAncestors(path);
		this.refresh();
	}

	private expandAncestors(path: string): void {
		let current = path;
		while (current) {
			this.expanded.add(current);
			const parent = current.lastIndexOf('/');
			if (parent < 0) break;
			current = current.slice(0, parent);
		}
		this.saveNavigationState();
	}

	private saveNavigationState(): void {
		const id = this.currentShelf?.id;
		if (!id) return;
		this.expandedByShelf.set(id, new Set(this.expanded));
		if (this.focusedPath) this.focusedByShelf.set(id, this.focusedPath);
		this.onNavigationChange();
	}

	/** Re-render the tree into its existing root, without touching the parent view. */
	private refresh(): void {
		const root = this.root;
		const shelf = this.currentShelf;
		if (!root || !shelf) return;

		const scrollContainer = root.parentElement;
		const scrollTop = scrollContainer?.scrollTop ?? 0;
		const focusedPath = this.getFocusedPath();
		root.empty();

		if (shelf.kind === 'tag') {
			this.renderTagResults(root, shelf);
		} else if (shelf.folders.length === 0) {
			root.createEl('p', {
				text: 'No folders linked yet.',
				cls: 'shelf-view-empty-hint',
			});
		} else {
			for (const folderRef of shelf.folders) {
				const file = this.app.vault.getAbstractFileByPath(folderRef.path);
				if (file instanceof TFolder) {
					this.renderFolder(root, file, 0, true);
				} else {
					this.renderMissing(root, folderRef.path);
				}
			}
		}

		const items = this.getVisibleItems();
		const tabStop = items.find((item) => item.dataset.path === (focusedPath ?? this.focusedPath)) ?? items[0];
		if (tabStop) this.setTabStop(tabStop);
		if (scrollContainer) scrollContainer.scrollTop = scrollTop;
		if (focusedPath !== null && tabStop) this.focusItem(tabStop, true);
	}

	private renderTagResults(root: HTMLElement, shelf: Shelf): void {
		const tag = shelf.tag?.toLowerCase();
		if (!tag) return;
		const files = this.app.vault.getMarkdownFiles()
			.filter((file) => {
				const cache = this.app.metadataCache.getFileCache(file);
				return cache !== null && (getAllTags(cache) ?? [])
					.some((candidate) => candidate.toLowerCase() === tag);
			})
			.sort((a, b) => a.path.localeCompare(b.path));
		if (files.length === 0) {
			root.createEl('p', { text: `No notes with ${shelf.tag}.`, cls: 'shelf-view-empty-hint' });
			return;
		}
		let lastParent: string | null = null;
		for (const file of files) {
			const parent = file.parent?.path ?? '';
			if (parent !== lastParent) {
				root.createDiv({ text: parent || 'Vault root', cls: 'shelf-tree-group-heading' });
				lastParent = parent;
			}
			this.renderFile(root, file, 0, true);
		}
	}

	// --- Rendering ----------------------------------------------------------

	private renderFolder(
		parent: HTMLElement,
		folder: TFolder,
		depth: number,
		isLinkedRoot: boolean,
	): void {
		const item = parent.createDiv({ cls: 'shelf-tree-item is-folder' });
		const isExpanded = this.expanded.has(folder.path);
		this.prepareItem(item, folder.path, folder.name || folder.path, depth);
		item.setAttribute('aria-expanded', String(isExpanded));

		const row = item.createDiv({ cls: 'shelf-tree-item-row' });
		row.style.setProperty('--shelf-depth', String(depth));

		const chevron = row.createSpan({ cls: 'shelf-tree-item-chevron' });
		setIcon(chevron, isExpanded ? 'chevron-down' : 'chevron-right');

		const iconEl = row.createSpan({ cls: 'shelf-tree-item-icon' });
		setIcon(iconEl, 'folder');

		// `folder.name` is empty for the vault root, so fall back to its path.
		row.createSpan({
			cls: 'shelf-tree-item-name',
			text: folder.name || folder.path,
		});
		const galleryButton = row.createEl('button', {
			cls: 'shelf-tree-gallery-action',
			attr: {
				type: 'button',
				'aria-label': `Open ${folder.name} as gallery`,
				title: 'Open as gallery',
				tabindex: '-1',
			},
		});
		setIcon(galleryButton, 'image');
		galleryButton.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			void openShelfGallery(this.app, folder.path);
		});

		row.addEventListener('click', () => {
			this.focusItem(item);
			if (this.expanded.has(folder.path)) {
				this.expanded.delete(folder.path);
			} else {
				this.expanded.add(folder.path);
			}
			this.saveNavigationState();
			this.refresh();
		});

		this.bindContextMenu(item, (source) => this.showFolderMenu(source, folder, isLinkedRoot));
		if (isLinkedRoot) this.bindRootDrag(item, folder);

		if (isExpanded) {
			const children = item.createDiv({ cls: 'shelf-tree-item-children' });
			children.setAttribute('role', 'group');
			for (const child of this.sortChildren(folder.children)) {
				if (child instanceof TFolder) {
					this.renderFolder(children, child, depth + 1, false);
				} else if (child instanceof TFile) {
					this.renderFile(children, child, depth + 1);
				}
			}
		}
	}

	private renderFile(parent: HTMLElement, file: TFile, depth: number, forceShow = false): void {
		const settings = this.shelfManager.getSettings();
		if (!forceShow && !settings.showFiles) return;
		if (
			!forceShow &&
			settings.fileExtensions.length > 0 &&
			!settings.fileExtensions.includes(file.extension.toLowerCase())
		) {
			return;
		}

		const item = parent.createDiv({ cls: 'shelf-tree-item is-file' });
		const displayName = file.extension.toLowerCase() === 'md' ? file.basename : file.name;
		this.prepareItem(item, file.path, displayName, depth);
		const row = item.createDiv({ cls: 'shelf-tree-item-row' });

		// Files don't have a chevron, so add an extra indent to keep names aligned
		// with the folder names above them.
		row.style.setProperty('--shelf-depth', String(depth + 1));

		const iconEl = row.createSpan({ cls: 'shelf-tree-item-icon' });
		setIcon(iconEl, 'file');

		// Match Obsidian convention: hide the `.md` extension for markdown notes.
		row.createSpan({ cls: 'shelf-tree-item-name', text: displayName });

		row.addEventListener('click', () => {
			this.focusItem(item);
			void this.app.workspace.getLeaf().openFile(file);
		});

		this.bindContextMenu(item, (source) => this.showFileMenu(source, file));
	}

	private renderMissing(parent: HTMLElement, path: string): void {
		const item = parent.createDiv({ cls: 'shelf-tree-item is-missing' });
		this.prepareItem(item, path, `${path} (missing)`, 0);
		const row = item.createDiv({ cls: 'shelf-tree-item-row' });

		const iconEl = row.createSpan({ cls: 'shelf-tree-item-icon' });
		setIcon(iconEl, 'alert-triangle');

		row.createSpan({
			cls: 'shelf-tree-item-name',
			text: `${path} (missing)`,
		});
		row.setAttribute('title', `Folder no longer exists: ${path}`);

		row.addEventListener('click', () => this.focusItem(item));
		item.addEventListener('keydown', (event) => {
			if (event.target !== item || (event.key !== 'Enter' && event.key !== ' ')) return;
			event.preventDefault();
			event.stopPropagation();
			this.showMissingMenu(item, path);
		});
		this.bindContextMenu(item, (source) => this.showMissingMenu(source, path));
	}

	// --- Keyboard navigation -----------------------------------------------

	private prepareItem(item: HTMLElement, path: string, label: string, depth: number): void {
		item.setAttribute('role', 'treeitem');
		item.setAttribute('aria-label', label);
		item.setAttribute('aria-level', String(depth + 1));
		item.dataset.path = path;
		item.tabIndex = -1;
	}

	private getVisibleItems(): HTMLElement[] {
		return Array.from(this.root?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
	}

	private setTabStop(item: HTMLElement): void {
		for (const candidate of this.getVisibleItems()) {
			candidate.tabIndex = candidate === item ? 0 : -1;
		}
		this.focusedPath = item.dataset.path ?? null;
		if (this.currentShelf && this.focusedPath !== this.focusedByShelf.get(this.currentShelf.id)) {
			this.saveNavigationState();
		}
	}

	private focusItem(item: HTMLElement, preventScroll = false): void {
		this.setTabStop(item);
		item.focus({ preventScroll });
	}

	private onKeyDown(event: KeyboardEvent): void {
		const item = event.target;
		if (
			!(item instanceof HTMLElement) ||
			item.getAttribute('role') !== 'treeitem' ||
			event.altKey || event.ctrlKey || event.metaKey
		) return;

		const items = this.getVisibleItems();
		const index = items.indexOf(item);
		if (index < 0) return;

		switch (event.key) {
			case 'ArrowDown': {
				event.preventDefault();
				const next = items[index + 1];
				if (next) this.focusItem(next);
				break;
			}
			case 'ArrowUp': {
				event.preventDefault();
				const previous = items[index - 1];
				if (previous) this.focusItem(previous);
				break;
			}
			case 'Home':
				event.preventDefault();
				if (items[0]) this.focusItem(items[0]);
				break;
			case 'End': {
				event.preventDefault();
				const last = items[items.length - 1];
				if (last) this.focusItem(last);
				break;
			}
			case 'ArrowRight':
				event.preventDefault();
				if (!item.classList.contains('is-folder')) break;
				if (item.getAttribute('aria-expanded') === 'false') {
					this.activateItem(item);
				} else {
					const group = item.querySelector<HTMLElement>(':scope > [role="group"]');
					const child = group?.querySelector<HTMLElement>(':scope > [role="treeitem"]');
					if (child) this.focusItem(child);
				}
				break;
			case 'ArrowLeft':
				event.preventDefault();
				if (item.getAttribute('aria-expanded') === 'true') {
					this.activateItem(item);
				} else {
					const parent = item.parentElement?.closest<HTMLElement>('[role="treeitem"]');
					if (parent) this.focusItem(parent);
				}
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				this.activateItem(item);
				break;
		}
	}

	private activateItem(item: HTMLElement): void {
		item.querySelector<HTMLElement>(':scope > .shelf-tree-item-row')?.click();
	}

	private bindContextMenu(
		item: HTMLElement,
		showMenu: (source: MouseEvent | HTMLElement) => void,
	): void {
		item.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			event.stopPropagation();
			showMenu(event);
		});
		item.addEventListener('keydown', (event) => {
			if (event.target !== item || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return;
			event.preventDefault();
			event.stopPropagation();
			showMenu(item);
		});
	}

	// --- Context menus ------------------------------------------------------

	private showFolderMenu(
		source: MouseEvent | HTMLElement,
		folder: TFolder,
		isLinkedRoot: boolean,
	): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle('Open as gallery').setIcon('image').onClick(() => {
				void openShelfGallery(this.app, folder.path);
			}),
		);
		menu.addSeparator();

		// Our own "essentials" — the file-menu event doesn't carry these items,
		// since the native file explorer adds them directly to its own menu.
		menu.addItem((item) =>
			item
				.setTitle('New note')
				.setIcon('file-plus')
				.onClick(() => {
					new CreateVaultItemModal(this.app, folder, 'note', () => {
						this.expanded.add(folder.path);
						this.refresh();
					}).open();
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle('Quick note')
				.setIcon('zap')
				.onClick(() => {
					void createQuickNote(this.app, folder, () => {
						this.expanded.add(folder.path);
						this.refresh();
					});
				}),
		);

		menu.addItem((item) =>
			item
				.setTitle('New folder')
				.setIcon('folder-plus')
				.onClick(() => {
					new CreateVaultItemModal(this.app, folder, 'folder', () => {
						this.expanded.add(folder.path);
						this.refresh();
					}).open();
				}),
		);

		menu.addSeparator();

		menu.addItem((item) =>
			item
				.setTitle('Rename…')
				.setIcon('pencil')
				.onClick(() => {
					new RenameFileModal(this.app, folder).open();
				}),
		);
		if (!isLinkedRoot && this.currentShelf?.kind === 'folders') {
			menu.addItem((item) => item.setTitle('Move to…').setIcon('folder-input').onClick(() => {
				const shelf = this.currentShelf;
				if (shelf) new MoveVaultItemModal(this.app, folder, shelf, (path) => this.expandFolder(path)).open();
			}));
		}

		menu.addItem((item) =>
			item
				.setTitle('Delete')
				.setIcon('trash-2')
				.setWarning(true)
				.onClick(() => {
					new DeleteFileModal(this.app, folder).open();
				}),
		);

		menu.addSeparator();

		// Let Obsidian and other plugins populate the standard items.
		this.app.workspace.trigger('file-menu', menu, folder, MENU_SOURCE);

		if (isLinkedRoot) {
			const activeId = this.shelfManager.getActiveShelfId();
			if (activeId !== null) {
				menu.addSeparator();
				const roots = this.shelfManager.getShelf(activeId)?.folders ?? [];
				const index = roots.findIndex((root) => root.path === folder.path);
				const previous = roots[index - 1];
				const next = roots[index + 1];
				if (previous) menu.addItem((item) =>
					item.setTitle('Move up').setIcon('arrow-up').onClick(() => {
						void this.moveLinkedRoot(activeId, folder.path, previous.path, false);
					}),
				);
				if (next) menu.addItem((item) =>
					item.setTitle('Move down').setIcon('arrow-down').onClick(() => {
						void this.moveLinkedRoot(activeId, folder.path, next.path, true);
					}),
				);
				if (previous || next) menu.addSeparator();
				menu.addItem((item) =>
					item
						.setTitle('Remove from shelf')
						.setIcon('x')
						.setWarning(true)
						.onClick(() => {
							void this.shelfManager.removeFolderFromShelf(activeId, folder.path);
						}),
				);
			}
		}

		this.showMenu(menu, source);
	}

	private showFileMenu(source: MouseEvent | HTMLElement, file: TFile): void {
		const menu = new Menu();

		// Same reasoning as folders: these live in the file explorer itself,
		// not in the `file-menu` event, so we add them ourselves.
		menu.addItem((item) =>
			item
				.setTitle('Open in new tab')
				.setIcon('file-plus')
				.onClick(() => {
					void this.app.workspace.getLeaf('tab').openFile(file);
				}),
		);

		menu.addItem((item) =>
			item
				.setTitle('Open to the right')
				.setIcon('separator-vertical')
				.onClick(() => {
					void this.app.workspace.getLeaf('split').openFile(file);
				}),
		);

		menu.addItem((item) =>
			item
				.setTitle('Open in new window')
				.setIcon('picture-in-picture-2')
				.onClick(() => {
					void this.app.workspace.getLeaf('window').openFile(file);
				}),
		);

		menu.addSeparator();

		menu.addItem((item) =>
			item
				.setTitle('Rename…')
				.setIcon('pencil')
				.onClick(() => {
					new RenameFileModal(this.app, file).open();
				}),
		);
		if (this.currentShelf?.kind === 'folders') {
			menu.addItem((item) => item.setTitle('Move to…').setIcon('folder-input').onClick(() => {
				const shelf = this.currentShelf;
				if (shelf) new MoveVaultItemModal(this.app, file, shelf, (path) => this.expandFolder(path)).open();
			}));
		}

		menu.addItem((item) =>
			item
				.setTitle('Delete')
				.setIcon('trash-2')
				.setWarning(true)
				.onClick(() => {
					new DeleteFileModal(this.app, file).open();
				}),
		);

		menu.addSeparator();

		this.app.workspace.trigger('file-menu', menu, file, MENU_SOURCE);
		this.showMenu(menu, source);
	}

	private showMissingMenu(source: MouseEvent | HTMLElement, path: string): void {
		const menu = new Menu();
		const activeId = this.shelfManager.getActiveShelfId();
		if (activeId !== null) {
			menu.addItem((item) =>
				item
					.setTitle('Remove from shelf')
					.setIcon('x')
					.setWarning(true)
					.onClick(() => {
						void this.shelfManager.removeFolderFromShelf(activeId, path);
					}),
			);
		}
		this.showMenu(menu, source);
	}

	private showMenu(menu: Menu, source: MouseEvent | HTMLElement): void {
		if (source instanceof MouseEvent) {
			menu.showAtMouseEvent(source);
		} else {
			const rect = source.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom }, source.ownerDocument);
		}
	}

	/** Dragging a linked root changes only its order in this shelf. */
	private bindRootDrag(item: HTMLElement, folder: TFolder): void {
		const row = item.querySelector<HTMLElement>(':scope > .shelf-tree-item-row');
		if (!row) return;
		row.draggable = true;
		row.setAttribute('title', 'Drag to reorder linked folders');
		row.addEventListener('dragstart', (event) => {
			if (!event.dataTransfer) return;
			const shelfId = this.currentShelf?.id;
			if (!shelfId) return;
			event.dataTransfer.setData(FOLDER_DRAG_TYPE, folder.path);
			event.dataTransfer.setData(FOLDER_SHELF_TYPE, shelfId);
			event.dataTransfer.effectAllowed = 'move';
			event.stopPropagation();
		});
		row.addEventListener('dragover', (event) => {
			if (!event.dataTransfer?.types.includes(FOLDER_DRAG_TYPE) ||
				(event.target instanceof HTMLElement && event.target.closest('[role="treeitem"]') !== item)) return;
			event.preventDefault();
			event.stopPropagation();
			event.dataTransfer.dropEffect = 'move';
			const after = event.clientY > row.getBoundingClientRect().top + row.clientHeight / 2;
			row.toggleClass('shelf-drop-before', !after);
			row.toggleClass('shelf-drop-after', after);
		});
		row.addEventListener('dragleave', () => {
			row.removeClass('shelf-drop-before', 'shelf-drop-after');
		});
		row.addEventListener('drop', (event) => {
			row.removeClass('shelf-drop-before', 'shelf-drop-after');
			if (!event.dataTransfer?.types.includes(FOLDER_DRAG_TYPE) ||
				(event.target instanceof HTMLElement && event.target.closest('[role="treeitem"]') !== item)) return;
			event.preventDefault();
			event.stopPropagation();
			const shelfId = this.currentShelf?.id;
			if (!shelfId || event.dataTransfer.getData(FOLDER_SHELF_TYPE) !== shelfId) return;
			const path = event.dataTransfer.getData(FOLDER_DRAG_TYPE);
			const after = event.clientY > row.getBoundingClientRect().top + row.clientHeight / 2;
			if (path) void this.moveLinkedRoot(shelfId, path, folder.path, after);
		});
	}

	private async moveLinkedRoot(
		shelfId: string, path: string, targetPath: string, after: boolean,
	): Promise<void> {
		try {
			await this.shelfManager.moveLinkedFolder(shelfId, path, targetPath, after);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		}
	}

	// --- Helpers ------------------------------------------------------------

	/** Folders before files; alphabetical inside each group. */
	private sortChildren(children: readonly TAbstractFile[]): TAbstractFile[] {
		return [...children].sort((a, b) => {
			const aIsFolder = a instanceof TFolder;
			const bIsFolder = b instanceof TFolder;
			if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}
}
