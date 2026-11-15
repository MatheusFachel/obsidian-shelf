import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { SHELF_VIEW_ICON, SHELF_VIEW_LABEL, SHELF_VIEW_TYPE } from './constants';
import { ShelfManager } from './services/ShelfManager';
import { registerVaultSync } from './services/registerVaultSync';
import { ShelfView } from './view/ShelfView';

export default class ShelfPlugin extends Plugin {
	// `!` tells TypeScript we will initialise this before anything reads it —
	// which we do on the first line of `onload()`.
	shelfManager!: ShelfManager;

	async onload() {
		this.shelfManager = new ShelfManager(this);
		await this.shelfManager.load();
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

		// Ribbon icon: clicking it opens (or focuses) the Shelf view in the sidebar.
		this.addRibbonIcon(SHELF_VIEW_ICON, SHELF_VIEW_LABEL, () => {
			void this.activateView();
		});
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
	private async activateView(): Promise<void> {
		const { workspace } = this.app;

		// If a leaf of our type is already open, just reveal it.
		const existing = workspace.getLeavesOfType(SHELF_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			await workspace.revealLeaf(existing[0]);
			return;
		}

		// Otherwise, open a new leaf in the left sidebar.
		const leaf = workspace.getLeftLeaf(false);
		if (!leaf) return;

		await leaf.setViewState({ type: SHELF_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}
}
