import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { SHELF_GALLERY_VIEW_TYPE, SHELF_VIEW_ICON, SHELF_VIEW_LABEL, SHELF_VIEW_TYPE } from './constants';
import { openQuickNote } from './modals/QuickNoteFolderModal';
import { ShelfManager } from './services/ShelfManager';
import { registerVaultSync } from './services/registerVaultSync';
import { ShelfSettingTab } from './settings/ShelfSettingTab';
import { ShelfGalleryView } from './view/ShelfGalleryView';
import { ShelfView } from './view/ShelfView';

export default class ShelfPlugin extends Plugin {
	// `!` tells TypeScript we will initialise this before anything reads it —
	// which we do on the first line of `onload()`.
	shelfManager!: ShelfManager;

	async onload() {
		this.shelfManager = new ShelfManager(this);
		await this.shelfManager.load();
		this.addSettingTab(new ShelfSettingTab(this.app, this, this.shelfManager));
		registerVaultSync(this, this.shelfManager);
		// Also check when returning to Obsidian: development junctions may hide
		// external file changes from the config-folder watcher.
		this.registerDomEvent(window, 'focus', () => {
			void this.onExternalSettingsChange();
		});

		// Register the sidebar view. Obsidian will call the factory every time
		// a leaf of this type needs to be created — e.g. after a restart that
		// restores the workspace layout.
		this.registerView(
			SHELF_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new ShelfView(leaf, this.shelfManager),
		);
		this.registerView(
			SHELF_GALLERY_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new ShelfGalleryView(leaf, this.shelfManager),
		);

		// Ribbon icon: clicking it opens (or focuses) the Shelf view in the sidebar.
		this.addRibbonIcon(SHELF_VIEW_ICON, SHELF_VIEW_LABEL, () => {
			void this.activateView();
		});
		this.registerCommands();
	}

	/** Add stable command IDs so users can assign their own hotkeys. */
	private registerCommands(): void {
		this.addCommand({
			id: 'open-view', name: 'Open view',
			callback: () => { void this.activateView(); },
		});
		this.addCommand({
			id: 'quick-note', name: 'Create quick note',
			callback: () => { void this.quickNote(); },
		});
		this.addCommand({
			id: 'next', name: 'Switch to next',
			callback: () => { void this.switchShelf(1); },
		});
		this.addCommand({
			id: 'previous', name: 'Switch to previous',
			callback: () => { void this.switchShelf(-1); },
		});
		for (let index = 0; index < 9; index++) {
			this.addCommand({
				id: `switch-to-${index + 1}`,
				name: `Switch to ${index + 1}`,
				checkCallback: (checking) => {
					const shelf = this.shelfManager.getAllShelves()[index];
					if (!shelf) return false;
					if (!checking) void this.selectShelf(shelf.id);
					return true;
				},
			});
		}
	}

	private async quickNote(): Promise<void> {
		const view = await this.activateView();
		openQuickNote(this.app, this.shelfManager, (path) => view?.revealFolder(path));
	}

	private async switchShelf(offset: number): Promise<void> {
		const shelves = this.shelfManager.getAllShelves();
		if (shelves.length === 0) {
			new Notice('Create a shelf first.');
			return;
		}
		const current = shelves.findIndex((shelf) => shelf.id === this.shelfManager.getActiveShelfId());
		const index = current < 0
			? (offset > 0 ? 0 : shelves.length - 1)
			: (current + offset + shelves.length) % shelves.length;
		const target = shelves[index];
		if (target) await this.selectShelf(target.id);
	}

	private async selectShelf(id: string): Promise<void> {
		try {
			await this.shelfManager.setActiveShelf(id);
			await this.activateView();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		}
	}

	/** Obsidian calls this when another program changes the plugin's data.json. */
	async onExternalSettingsChange(): Promise<void> {
		if (!this.shelfManager) return;
		try {
			await this.shelfManager.reloadFromDisk();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not reload shelves: ${message}`);
		}
	}

	/**
	 * Open the Shelf view in the left sidebar, or focus it if it already exists.
	 */
	private async activateView(): Promise<ShelfView | null> {
		const { workspace } = this.app;

		// If a leaf of our type is already open, just reveal it.
		const existing = workspace.getLeavesOfType(SHELF_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			await workspace.revealLeaf(existing[0]);
			return existing[0].view instanceof ShelfView ? existing[0].view : null;
		}

		// Otherwise, open a new leaf in the left sidebar.
		const leaf = workspace.getLeftLeaf(false);
		if (!leaf) return null;

		await leaf.setViewState({ type: SHELF_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
		return leaf.view instanceof ShelfView ? leaf.view : null;
	}
}
