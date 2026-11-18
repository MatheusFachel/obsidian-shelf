/**
 * Core data contracts for the Shelf plugin.
 *
 * Everything the plugin persists to `data.json` is described by `ShelfPluginData`.
 * These interfaces are pure type definitions — no runtime code lives here.
 */

/** Top-level shape of the plugin's persisted data. */
export interface ShelfPluginData {
	/** Schema version. Bumped when the shape below changes in a breaking way, so we can migrate. */
	version: number;

	/** Id of the shelf currently displayed in the view, or `null` if none is selected. */
	activeShelfId: string | null;

	/** Ordered list of shelves. Order in the array defines their position in the icon bar. */
	shelves: Shelf[];

	/** Global plugin settings. */
	settings: ShelfSettings;
}

/** A single shelf — a named group of folders the user wants to see as one unit. */
export interface Shelf {
	/** Unique identifier (UUID v4). Generated once, never changed. */
	id: string;

	/** Display name shown in tooltips and the view header. */
	name: string;

	/** Lucide icon name, raw emoji, or an emoji prefixed with `emoji:`. */
	icon: string;

	/** Icon color (hex, rgb or CSS name). `null` means "use theme default". */
	color: string | null;

	/** Folders linked to this shelf, in the order they should be rendered. */
	folders: ShelfFolder[];

	/** Unix timestamp (ms) when this shelf was created. */
	createdAt: number;
}

/** A folder linked to a shelf. Stored by path, not by reference. */
export interface ShelfFolder {
	/** Vault-relative path of the folder, e.g. `"Books/Novels"`. */
	path: string;
}

/** Global plugin settings persisted in `data.json`. */
export interface ShelfSettings {
	/** If true, the tree shows files; if false, only folders are displayed. */
	showFiles: boolean;

	/**
	 * File extensions to include in the tree, without the leading dot (e.g. `["md", "canvas"]`).
	 * An empty array means "show all extensions".
	 */
	fileExtensions: string[];

	/** Width of gallery cards in pixels. */
	galleryThumbnailSize: number;

	/** Open images in the gallery lightbox instead of opening the image file. */
	galleryClickToZoom: boolean;

}
