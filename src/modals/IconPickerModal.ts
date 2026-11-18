import { App, FuzzySuggestModal, getIconIds, setIcon } from 'obsidian';
import type { FuzzyMatch } from 'obsidian';

/** Search every icon currently registered with Obsidian and preview each result. */
export class IconPickerModal extends FuzzySuggestModal<string> {
	constructor(app: App, private readonly onChoose: (icon: string) => void) {
		super(app);
		this.setPlaceholder('Search icons…');
		this.setInstructions([
			{ command: '↑↓', purpose: 'navigate' },
			{ command: '↵', purpose: 'choose icon' },
			{ command: 'esc', purpose: 'cancel' },
		]);
	}

	getItems(): string[] {
		return getIconIds().sort((a, b) => a.localeCompare(b));
	}

	getItemText(icon: string): string {
		return icon;
	}

	renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement): void {
		const preview = el.createSpan({ cls: 'shelf-icon-picker-preview' });
		setIcon(preview, match.item);
		el.createSpan({ text: match.item });
	}

	onChooseItem(icon: string): void {
		this.onChoose(icon);
	}
}
