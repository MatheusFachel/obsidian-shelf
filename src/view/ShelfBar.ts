import { App, Menu, Notice, setIcon } from 'obsidian';
import { CreateShelfModal } from '../modals/CreateShelfModal';
import { DeleteShelfModal } from '../modals/DeleteShelfModal';
import type { ShelfManager } from '../services/ShelfManager';
import type { Shelf } from '../types';
import { renderIcon } from '../utils/icons';

const SHELF_DRAG_TYPE = 'application/x-obsidian-shelf-id';

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
		bar.addEventListener('dragover', (event) => {
			if (!event.dataTransfer?.types.includes(SHELF_DRAG_TYPE) ||
				(event.target instanceof HTMLElement && event.target.closest('.shelf-bar-item:not(.shelf-bar-add)'))) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = 'move';
			bar.addClass('shelf-drop-end');
		});
		bar.addEventListener('dragleave', (event) => {
			if (!(event.relatedTarget instanceof Node) || !bar.contains(event.relatedTarget)) {
				bar.removeClass('shelf-drop-end');
			}
		});
		bar.addEventListener('drop', (event) => {
			bar.removeClass('shelf-drop-end');
			if (!event.dataTransfer?.types.includes(SHELF_DRAG_TYPE) ||
				(event.target instanceof HTMLElement && event.target.closest('.shelf-bar-item:not(.shelf-bar-add)'))) return;
			event.preventDefault();
			const id = event.dataTransfer.getData(SHELF_DRAG_TYPE);
			if (id) void this.moveShelf(id, null, false);
		});

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
				title: `${shelf.name} — drag to reorder`,
				'data-shelf-id': shelf.id,
			},
		});
		if (active) btn.addClass('is-active');
		btn.draggable = true;
		if (typeof shelf.color === 'string' && CSS.supports('color', shelf.color)) {
			btn.addClass('has-color');
			btn.style.setProperty('--shelf-color', shelf.color);
		}

		const iconEl = btn.createSpan({ cls: 'shelf-bar-item-icon' });
		renderIcon(iconEl, shelf.icon);

		btn.addEventListener('click', (event) => {
			// Native buttons fire a click with detail 0 when activated by keyboard.
			void this.selectShelf(shelf.id, event.detail === 0);
		});
		btn.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			this.showShelfMenu(shelf, event);
		});
		btn.addEventListener('keydown', (event) => {
			if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
			event.preventDefault();
			this.showShelfMenu(shelf, event, btn);
		});
		btn.addEventListener('dragstart', (event) => {
			if (!event.dataTransfer) return;
			event.dataTransfer.setData(SHELF_DRAG_TYPE, shelf.id);
			event.dataTransfer.effectAllowed = 'move';
			event.stopPropagation();
		});
		btn.addEventListener('dragend', () => {
			btn.removeClass('shelf-drop-before', 'shelf-drop-after');
			parent.removeClass('shelf-drop-end');
		});
		btn.addEventListener('dragover', (event) => {
			if (!event.dataTransfer?.types.includes(SHELF_DRAG_TYPE)) return;
			event.preventDefault();
			event.stopPropagation();
			event.dataTransfer.dropEffect = 'move';
			const after = event.clientX > btn.getBoundingClientRect().left + btn.clientWidth / 2;
			btn.toggleClass('shelf-drop-before', !after);
			btn.toggleClass('shelf-drop-after', after);
		});
		btn.addEventListener('dragleave', () => {
			btn.removeClass('shelf-drop-before', 'shelf-drop-after');
		});
		btn.addEventListener('drop', (event) => {
			btn.removeClass('shelf-drop-before', 'shelf-drop-after');
			if (!event.dataTransfer?.types.includes(SHELF_DRAG_TYPE)) return;
			event.preventDefault();
			event.stopPropagation();
			const id = event.dataTransfer.getData(SHELF_DRAG_TYPE);
			const after = event.clientX > btn.getBoundingClientRect().left + btn.clientWidth / 2;
			if (id) void this.moveShelf(id, shelf.id, after);
		});
	}

	private async moveShelf(id: string, targetId: string | null, after: boolean): Promise<void> {
		try {
			await this.shelfManager.moveShelf(id, targetId, after);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		}
	}

	private showShelfMenu(shelf: Shelf, event: MouseEvent | KeyboardEvent, button?: HTMLElement): void {
		const menu = new Menu();
		const shelves = this.shelfManager.getAllShelves();
		const index = shelves.findIndex((candidate) => candidate.id === shelf.id);
		const previous = shelves[index - 1];
		const next = shelves[index + 1];
		if (previous) menu.addItem((item) => {
			item.setTitle('Move left').setIcon('arrow-left').onClick(() => {
				void this.moveShelf(shelf.id, previous.id, false);
			});
		});
		if (next) menu.addItem((item) => {
			item.setTitle('Move right').setIcon('arrow-right').onClick(() => {
				void this.moveShelf(shelf.id, next.id, true);
			});
		});
		if (previous || next) menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle('Edit shelf').setIcon('pencil').onClick(() => {
				new CreateShelfModal(this.app, this.shelfManager, shelf).open();
			});
		});
		menu.addItem((item) => {
			item.setTitle('Delete shelf').setIcon('trash-2').setWarning(true).onClick(() => {
				new DeleteShelfModal(this.app, this.shelfManager, shelf).open();
			});
		});
		if (event instanceof MouseEvent) {
			menu.showAtMouseEvent(event);
		} else if (button) {
			const rect = button.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom }, button.ownerDocument);
		}
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
