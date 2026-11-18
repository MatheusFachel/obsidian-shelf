import { App, Plugin, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';

/** Expose persisted tree display options in Obsidian's searchable settings UI. */
export class ShelfSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly shelfManager: ShelfManager) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Show files',
				desc: 'Show notes and other matching files under linked folders.',
				control: { type: 'toggle', key: 'showFiles' },
			},
			{
				name: 'File extensions',
				desc: 'Comma-separated extensions without dots. Leave empty to show every file type.',
				control: {
					type: 'text', key: 'fileExtensions', placeholder: 'md, canvas',
					validate: (value) => {
						const parts = value.split(',').map((part) => part.trim());
						return parts.some((part) => part && !/^[a-z0-9]+$/i.test(part))
							? 'Use extensions without dots or special characters.' : undefined;
					},
				},
			},
			{
				name: 'Gallery thumbnail size',
				desc: 'Size of cards in the gallery tab.',
				control: {
					type: 'slider', key: 'galleryThumbnailSize',
					min: 100, max: 500, step: 20,
				},
			},
			{
				name: 'Click image to zoom',
				desc: 'Open an image preview with navigation and zoom when selecting a gallery card.',
				control: { type: 'toggle', key: 'galleryClickToZoom' },
			},
		];
	}

	getControlValue(key: string): unknown {
		const settings = this.shelfManager.getSettings();
		if (key === 'showFiles') return settings.showFiles;
		if (key === 'fileExtensions') return settings.fileExtensions.join(', ');
		if (key === 'galleryThumbnailSize') return settings.galleryThumbnailSize;
		if (key === 'galleryClickToZoom') return settings.galleryClickToZoom;
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'showFiles' && typeof value === 'boolean') {
			await this.shelfManager.updateSettings({ showFiles: value });
		} else if (key === 'fileExtensions' && typeof value === 'string') {
			const fileExtensions = [...new Set(value.split(',')
				.map((part) => part.trim().toLowerCase())
				.filter(Boolean))];
			await this.shelfManager.updateSettings({ fileExtensions });
		} else if (key === 'galleryThumbnailSize' && typeof value === 'number') {
			await this.shelfManager.updateSettings({ galleryThumbnailSize: Math.max(100, Math.min(500, value)) });
		} else if (key === 'galleryClickToZoom' && typeof value === 'boolean') {
			await this.shelfManager.updateSettings({ galleryClickToZoom: value });
		}
	}
}
