import { App, Notice, TFolder } from 'obsidian';
import { SHELF_GALLERY_VIEW_TYPE } from '../constants';

/** Open one folder in Shelf's own gallery tab. */
export async function openShelfGallery(app: App, folderPath: string): Promise<void> {
	if (!(app.vault.getAbstractFileByPath(folderPath) instanceof TFolder)) {
		new Notice(`Folder not found: ${folderPath}`);
		return;
	}
	try {
		const leaf = app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: SHELF_GALLERY_VIEW_TYPE,
			active: true,
			state: { folderPath },
		});
		await app.workspace.revealLeaf(leaf);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Could not open gallery: ${message}`);
	}
}
