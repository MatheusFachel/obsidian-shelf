import { debounce, Notice, Plugin, TFile, TFolder } from 'obsidian';
import type { ShelfManager } from './ShelfManager';

/** Keep saved folder paths and the open tree in sync with vault changes. */
export function registerVaultSync(plugin: Plugin, shelfManager: ShelfManager): void {
	const isRelevant = (path: string): boolean => shelfManager.getAllShelves().some((shelf) =>
		shelf.folders.some((folder) =>
			path === folder.path || path.startsWith(folder.path + '/') || folder.path.startsWith(path + '/'),
		),
	);
	// A burst of file events should result in one view refresh.
	const refresh = debounce(() => shelfManager.notifyVaultChanged(), 100, true);
	plugin.register(() => refresh.cancel());

	plugin.registerEvent(plugin.app.vault.on('create', (file) => {
		// Obsidian fires create events for existing files while loading the vault.
		if (plugin.app.workspace.layoutReady && isRelevant(file.path)) refresh();
	}));

	plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => {
		const relevant = isRelevant(oldPath) || isRelevant(file.path);
		if (file instanceof TFolder) {
			void shelfManager.updateFolderPath(oldPath, file.path).catch(reportSyncError);
		} else if (file instanceof TFile) {
			void shelfManager.updateFilePath(oldPath, file.path).catch(reportSyncError);
		}
		if (relevant) refresh();
	}));

	plugin.registerEvent(plugin.app.vault.on('delete', (file) => {
		const relevant = isRelevant(file.path);
		if (file instanceof TFolder) {
			void shelfManager.removeFolderPath(file.path).catch(reportSyncError);
		}
		if (relevant) refresh();
	}));
}

function reportSyncError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	new Notice(`Could not update shelf folders: ${message}`);
}
