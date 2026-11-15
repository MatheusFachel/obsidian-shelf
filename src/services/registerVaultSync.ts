import { debounce, Notice, Plugin, TFolder } from 'obsidian';
import type { ShelfManager } from './ShelfManager';

/** Keep saved folder paths and the open tree in sync with vault changes. */
export function registerVaultSync(plugin: Plugin, shelfManager: ShelfManager): void {
	// A burst of file events should result in one view refresh.
	const refresh = debounce(() => shelfManager.notifyVaultChanged(), 100, true);
	plugin.register(() => refresh.cancel());

	plugin.registerEvent(plugin.app.vault.on('create', () => {
		// Obsidian fires create events for existing files while loading the vault.
		if (plugin.app.workspace.layoutReady) refresh();
	}));

	plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => {
		if (file instanceof TFolder) {
			void shelfManager.updateFolderPath(oldPath, file.path).catch(reportSyncError);
		}
		refresh();
	}));

	plugin.registerEvent(plugin.app.vault.on('delete', (file) => {
		if (file instanceof TFolder) {
			void shelfManager.removeFolderPath(file.path).catch(reportSyncError);
		}
		refresh();
	}));
}

function reportSyncError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	new Notice(`Could not update shelf folders: ${message}`);
}
