import { setIcon } from 'obsidian';

/**
 * Render an icon into a container element.
 *
 * Phase 1 ("layer 1") only knows how to draw two kinds of icons:
 *   - Lucide icon names (e.g. `"folder-open"`), via Obsidian's built-in `setIcon`.
 *   - Emojis, either as a raw unicode string (`"📚"`) or with the `emoji:` prefix
 *     (`"emoji:📚"`).
 *
 * Anything else — including namespaced icons from third-party packs the Notebook
 * Navigator plugin supports (`"phosphor:book-open"`, `"material-icons:folder"`, …)
 * — falls back to a generic folder icon. Layer 2 (reading those packs from NN's
 * IndexedDB) is a Phase 3 task per the design doc.
 */

const EMOJI_PREFIX = 'emoji:';

export function renderIcon(
	container: HTMLElement,
	icon: string | null | undefined,
): void {
	container.empty();

	if (!icon || icon.trim() === '') {
		setIcon(container, 'folder');
		return;
	}

	// "emoji:📚" — explicit prefix
	if (icon.startsWith(EMOJI_PREFIX)) {
		container.addClass('shelf-icon-emoji');
		container.setText(icon.slice(EMOJI_PREFIX.length));
		return;
	}

	// Raw unicode emoji typed by the user (e.g. just "📚" in the icon field)
	if (isLikelyEmoji(icon)) {
		container.addClass('shelf-icon-emoji');
		container.setText(icon);
		return;
	}

	// Namespaced icon from a third-party pack (NN-style "phosphor:book-open").
	// We can't render those in layer 1 — strip the namespace and try the bare
	// name as a Lucide id; if that fails too, fall back to "folder".
	const lucideName = icon.includes(':')
		? (icon.split(':')[1] ?? icon)
		: icon;

	setIcon(container, lucideName);

	// `setIcon` is silent on unknown names — it just doesn't append an SVG.
	// Detect that and fall back so we never end up with an empty button.
	if (container.children.length === 0) {
		setIcon(container, 'folder');
	}
}

/**
 * Heuristic: returns true if `str` looks more like an emoji than a Lucide name.
 *
 * Lucide names are kebab-case ASCII (`folder-open`, `book-marked`). If the
 * string is short and contains non-ASCII, we treat it as an emoji.
 */
function isLikelyEmoji(str: string): boolean {
	if (!str) return false;
	if (/^[a-z0-9-]+$/i.test(str)) return false;
	return [...str].length <= 8;
}
