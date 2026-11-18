import { App, Modal, Notice, Setting } from 'obsidian';
import type { ColorComponent } from 'obsidian';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';
import { renderIcon } from '../utils/icons';
import { IconPickerModal } from './IconPickerModal';

/** Create a shelf or edit its name, icon and color. */
export class CreateShelfModal extends Modal {
	private name: string;
	private icon: string;
	private color: string | null;
	private saving = false;

	constructor(
		app: App,
		private readonly shelfManager: ShelfManager,
		private readonly shelf?: Shelf,
	) {
		super(app);
		this.name = shelf?.name ?? '';
		this.icon = shelf?.icon ?? 'library';
		this.color = shelf?.color ?? null;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('shelf-modal');
		this.setTitle(this.shelf ? 'Edit shelf' : 'Create shelf');

		new Setting(contentEl)
			.setName('Name')
			.setDesc('Display name shown in the sidebar.')
			.addText((text) => {
				text.setPlaceholder('Shelf name').setValue(this.name).onChange((value) => {
					this.name = value;
				});
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		const iconSetting = new Setting(contentEl)
			.setName('Icon')
			.setDesc('Choose from the icons available in Obsidian.');
		const iconPreview = iconSetting.controlEl.createSpan({ cls: 'shelf-icon-preview' });
		const updatePreview = (): void => renderIcon(iconPreview, this.icon);
		updatePreview();
		iconSetting.addButton((button) => {
			button.setButtonText('Choose icon').onClick(() => {
				new IconPickerModal(this.app, (icon) => {
					this.icon = icon;
					updatePreview();
				}).open();
			});
		});

		let colorPicker: ColorComponent;
		let colorSetting: Setting;
		let lastCustomColor = this.color ?? '#808080';
		new Setting(contentEl)
			.setName('Custom icon color')
			.setDesc('Turn off to use your theme’s default color.')
			.addToggle((toggle) => {
				toggle.setValue(this.color !== null).onChange((enabled) => {
					if (enabled) {
						this.color = lastCustomColor;
						colorPicker.setValue(lastCustomColor.match(/^#[0-9a-f]{6}$/i) ? lastCustomColor : '#808080');
					} else {
						lastCustomColor = this.color ?? lastCustomColor;
						this.color = null;
					}
					colorPicker.setDisabled(!enabled);
					colorSetting.settingEl.toggleClass('shelf-color-disabled', !enabled);
				});
			});
		colorSetting = new Setting(contentEl)
			.setName('Color')
			.addColorPicker((picker) => {
				colorPicker = picker;
				picker.setValue(this.color?.match(/^#[0-9a-f]{6}$/i) ? this.color : '#808080');
				picker.setDisabled(this.color === null);
				picker.onChange((value) => {
					this.color = value;
					lastCustomColor = value;
				});
			});
		colorSetting.settingEl.toggleClass('shelf-color-disabled', this.color === null);

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText('Cancel').onClick(() => this.close());
			})
			.addButton((button) => {
				button.setButtonText(this.shelf ? 'Save' : 'Create').setCta().onClick(() => {
					if (this.saving) return;
					this.saving = true;
					button.setDisabled(true);
					void this.submit().finally(() => {
						this.saving = false;
						button.setDisabled(false);
					});
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		try {
			const values = { name: this.name, icon: this.icon, color: this.color };
			if (this.shelf) {
				await this.shelfManager.updateShelf(this.shelf.id, values);
			} else {
				await this.shelfManager.createShelf(values);
			}
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		}
	}
}
