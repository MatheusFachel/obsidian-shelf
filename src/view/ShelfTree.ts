import { App, Menu, setIcon, TAbstractFile, TFile, TFolder } from 'obsidian';
import { DeleteFileModal } from '../modals/DeleteFileModal';
import { RenameFileModal } from '../modals/RenameFileModal';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';

/** Source string passed to Obsidian's `file-menu` event so other plugins can identify us. */
const MENU_SOURCE = 'shelf-tree-context-menu';

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
	private focusedPath: string | null = null;

	constructor(
		private readonly app: App,
		private readonly shelfManager: ShelfManager,
	) {}

	/** First-time render: create the tree root inside `parent` and populate it. */
	render(parent: HTMLElement, shelf: Shelf): void {
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

	/** Re-render the tree into its existing root, without touching the parent view. */
	private refresh(): void {
		const root = this.root;
		const shelf = this.currentShelf;
		if (!root || !shelf) return;

		const scrollContainer = root.parentElement;
		const scrollTop = scrollContainer?.scrollTop ?? 0;
		const focusedPath = this.getFocusedPath();
		root.empty();

		if (shelf.folders.length === 0) {
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

		row.addEventListener('click', () => {
			this.focusItem(item);
			if (this.expanded.has(folder.path)) {
				this.expanded.delete(folder.path);
			} else {
				this.expanded.add(folder.path);
			}
			this.refresh();
		});

		this.bindContextMenu(item, (source) => this.showFolderMenu(source, folder, isLinkedRoot));

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

	private renderFile(parent: HTMLElement, file: TFile, depth: number): void {
		const settings = this.shelfManager.getSettings();
		if (!settings.showFiles) return;
		if (
			settings.fileExtensions.length > 0 &&
			!settings.fileExtensions.includes(file.extension)
		) {
			return;
		}

		const item = parent.createDiv({ cls: 'shelf-tree-item is-file' });
		const displayName = file.extension === 'md' ? file.basename : file.name;
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

		// Our own "essentials" — the file-menu event doesn't carry these items,
		// since the native file explorer adds them directly to its own menu.
		menu.addItem((item) =>
			item
				.setTitle('Rename…')
				.setIcon('pencil')
				.onClick(() => {
					new RenameFileModal(this.app, folder).open();
				}),
		);

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
