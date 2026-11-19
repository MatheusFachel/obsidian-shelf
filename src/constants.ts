/**
 * Plugin-wide constants: view ids, default data, and magic strings.
 *
 * Anything that is referenced from more than one module and is a fixed value
 * belongs here. Keeping it centralised makes renames and schema changes trivial.
 */

import type { ShelfPluginData } from './types';

/** Unique identifier for the Shelf sidebar view. Used by `registerView` and `getLeavesOfType`. */
export const SHELF_VIEW_TYPE = 'shelf-view';

/** Human-readable label for the view, shown in tab titles and menus. */
export const SHELF_VIEW_LABEL = 'Shelf';

/** Lucide icon used for the ribbon button and the view's tab icon. */
export const SHELF_VIEW_ICON = 'library';

/** Dedicated tab for browsing one vault folder as a visual grid. */
export const SHELF_GALLERY_VIEW_TYPE = 'shelf-gallery-view';

/** Current data schema version. Bump this when `ShelfPluginData` shape changes in a breaking way. */
export const CURRENT_DATA_VERSION = 4;

/**
 * Default plugin data. Used on first launch, and merged over `loadData()` to
 * fill in any missing fields when new settings are introduced in future versions.
 */
export const DEFAULT_DATA: ShelfPluginData = {
	version: CURRENT_DATA_VERSION,
	activeShelfId: null,
	shelves: [],
	settings: {
		showFiles: true,
		fileExtensions: [],
		galleryThumbnailSize: 200,
		galleryClickToZoom: true,
	},
};
