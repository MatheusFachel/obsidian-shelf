import { App, Notice, setIcon } from 'obsidian';
import { CreateShelfModal } from '../modals/CreateShelfModal';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';
import { renderIcon } from '../utils/icons';

/**
 * Horizontal bar of shelf icons rendered at the top of the Shelf view.
 *
 * Each shelf is shown as a button with its icon; clicking selects that shelf
 * as the active one. A "+" button at the end opens the create-shelf modal.
 *
 * The bar is intentionally "dumb": it doesn't subscribe to the manager itself.
 * The parent `ShelfView` calls `render(parent)` whenever it re-renders, which
 * happens on every change notification.
 */
export class ShelfBar {
	constructor(
		private readonly app: App,
		private readonly shelfManager: ShelfManager,
		private readonly onKeyboardSelect: (shelfId: string) => void,
	) {}

	render(parent: HTMLElement): void {
		const bar = parent.createDiv({ cls: 'shelf-bar' });

		const shelves = this.shelfManager.getAllShelves();
		const activeId = this.shelfManager.getActiveShelfId();

		for (const shelf of shelves) {
			this.renderShelfButton(bar, shelf, shelf.id === activeId);
		}

		this.renderAddButton(bar);
	}

	private renderShelfButton(parent: HTMLElement, shelf: Shelf, active: boolean): void {
		const btn = parent.createEl('button', {
			cls: 'shelf-bar-item',
			attr: {
				type: 'button',
				'aria-label': shelf.name,
				title: shelf.name,
				'data-shelf-id': shelf.id,
			},
		});
		if (active) btn.addClass('is-active');

		const iconEl = btn.createSpan({ cls: 'shelf-bar-item-icon' });
		renderIcon(iconEl, shelf.icon);

		btn.addEventListener('click', (event) => {
			// Native buttons fire a click with detail 0 when activated by keyboard.
			void this.selectShelf(shelf.id, event.detail === 0);
		});
	}

	private async selectShelf(id: string, moveFocusToTree: boolean): Promise<void> {
		try {
			await this.shelfManager.setActiveShelf(id);
			if (moveFocusToTree) this.onKeyboardSelect(id);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		}
	}

	private renderAddButton(parent: HTMLElement): void {
		const btn = parent.createEl('button', {
			cls: 'shelf-bar-item shelf-bar-add',
			attr: {
				type: 'button',
				'aria-label': 'New shelf',
				title: 'New shelf',
			},
		});
		const iconEl = btn.createSpan({ cls: 'shelf-bar-item-icon' });
		setIcon(iconEl, 'plus');

		btn.addEventListener('click', () => {
			new CreateShelfModal(this.app, this.shelfManager).open();
		});
	}
}
