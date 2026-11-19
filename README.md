# Shelf for Obsidian

Shelf gives large Obsidian vaults a smaller, focused file tree. Create named shelves, link the folders you use together, and switch between them from a compact sidebar. Each shelf is a view of your existing vault; linking a folder never moves or copies its files.

Shelf also opens any folder as an image gallery in a central tab. The gallery is built into Shelf and does not require Folder as Gallery or another plugin.

**Status:** Public release (0.2.0). Desktop Obsidian 1.13.0 or newer is required. Shelf is not yet listed in Obsidian's community plugin catalog.

## New in 0.2.0

- **Move to…** on notes and nested folders offers destinations in the active folder shelf and confirms the resulting path before changing the vault.
- **Include subfolders** in a gallery tab shows images from nested folders with their origin beneath each file name. The choice is saved with the tab layout.
- **Collections** appear below a shelf's tree. Create a collection there, then use an image's gallery menu to add it. Collections store image paths only; removing a reference does not remove its vault file. Renamed paths follow the original file, and deleted images are shown as missing references.
- **Add current note folder** in the command palette links the parent folder of the open Markdown note to a folder shelf.
- **Resume navigation** restores expanded folders and the last tree item through Obsidian's workspace layout state.
- **Tag shelves** can be created alongside folder shelves. They list Markdown notes with a chosen tag, grouped by source folder. Membership updates from note metadata; tag shelves do not define a destination for new notes.

For a step-by-step check in a separate vault, see [the test guide](docs/testes-seis-funcionalidades.md).

## Features

| Area | What you can do |
| --- | --- |
| Shelves | Create, edit, color, icon, reorder, and delete folder or tag shelves. Choose icons from a searchable picker. |
| Folder views | Link existing folders, expand nested folders, reorder linked roots, and navigate with the keyboard. The same folder may appear on different shelves. |
| File work | Create Markdown notes and subfolders, make a quick note, open files, rename, and delete with confirmation. |
| Image gallery | Browse a folder's images in a central tab, optionally include subfolders, search by file name, enlarge an image, navigate, zoom, and use image file actions. |
| Collections | Group references to vault images below a shelf without copying their files. |
| Commands | Open Shelf, switch to the next or previous shelf, switch to shelves 1–9, create a quick note, and link the current note's folder from the command palette. |

## Use Shelf

1. Enable **Shelf** in **Settings → Community plugins**.
2. Select the library icon in the left ribbon to open the Shelf view.
3. Select **+** to create a shelf. Choose an icon from the searchable list and optionally pick a custom color.
4. Select the folder button next to the shelf name to link a folder.
5. Select a shelf icon to switch shelves. Select a folder to expand it, or select a note to open it.
6. Right-click any folder in Shelf and select **New note** or **New folder** to create something inside it.

Select the image button beside any folder, or right-click the folder and select **Open as gallery**, to browse images directly inside it. The gallery shows PNG, JPG, JPEG, GIF, WebP, SVG, BMP, and AVIF files; notes, videos, and other files stay out of this view. Open a subfolder's gallery separately from the Shelf tree.

Search filters images by file name. Select an image for a larger preview with a thumbnail strip. Use **←/→** or the mouse wheel to move between images, **↑/↓** or **+/-** to zoom, and drag a zoomed image to pan. Press **Esc** to close the preview. Right-click an image to open it in a new tab, copy its vault path, rename it, or delete it with confirmation. Gallery tabs follow folder renames and update when images change. Enable **Include subfolders** in the gallery to show images from nested folders.

Drag shelf icons to change their order. Drag linked root folders within a shelf to change their display order; this does not move vault folders. The context menus also offer **Move left/right** and **Move up/down** for keyboard use. Nested folders retain the vault's alphabetical order.

Select the file-plus button beside the shelf title or run **Shelf: Create quick note** from the command palette. With one linked root, Shelf creates and opens a uniquely named `Untitled.md` there. With multiple linked roots, choose a destination first. A folder's context menu also has **Quick note** for creating one directly inside that folder.

The command palette also offers **Open view**, **Switch to next**, **Switch to previous**, and **Switch to 1–9**. Assign hotkeys to these commands in Obsidian if desired.

A folder can be linked to more than one shelf. Within one shelf, a folder and its parent or child cannot both be linked as separate roots, which prevents duplicate content in the tree. Expand the parent folder to reach its subfolders.

Right-click a shelf icon for **Edit shelf** or **Delete shelf**. Deleting a shelf removes its links, but leaves files and folders in the vault. Right-click a folder or note for Obsidian's file actions. **Rename** uses Obsidian's file manager. **Delete** asks for confirmation and uses your Obsidian trash preference. **Remove from shelf** removes only the folder link. The tree follows folder renames, creations and deletions in the vault.

### Install manually

Until Shelf is in the community catalog, install it from a GitHub release:

1. Download `main.js`, `manifest.json`, and `styles.css` from the same release.
2. Create `<your vault>/.obsidian/plugins/shelf/` and put those three files inside it.
3. Restart Obsidian, then enable **Shelf** under **Settings → Community plugins**.

To update, replace the three release files and reload Obsidian. Keep the plugin folder's `data.json`: it stores your shelf configuration.

### Keyboard

Use **Tab** to reach a shelf icon and **Enter** to open its tree. **Shift+F10** opens the shelf's context menu. In the tree, use **↑/↓** to move between visible items, **→** to expand or enter a folder, **←** to collapse or return to its parent, and **Enter** or **Space** to activate an item. **Home** and **End** move to the first and last visible items. **Shift+F10** opens the focused item's context menu.

## Data and privacy

Shelf stores shelf names, icons, colors, linked folder paths, collection image paths, order, and settings in Obsidian's local plugin `data.json`. It reads vault files to render the tree and gallery. The gallery displays local images using Obsidian resource URLs. Shelf does not send vault data to a server or collect telemetry.

## Settings

In **Settings → Community plugins → Shelf**, choose whether to show files and optionally list the file extensions to display. An empty extension list shows all file types. These settings affect only the Shelf tree. You can also adjust gallery card size and choose whether selecting an image opens the large preview or opens the file in Obsidian.

## Development

Install dependencies and run the checks:

```sh
npm ci
npm run build
npm run lint
npm test
```

The build writes `main.js` next to `manifest.json` and `styles.css`. `main.js` is a release artifact and is excluded from Git. To test in a vault, place those three files in `<vault>/.obsidian/plugins/shelf/`, enable the plugin, and reload it after rebuilding. The local development vault can point that plugin directory at this project with a junction or symbolic link.

Issues and contributions are welcome through this repository. Test file operations in a separate vault before changing valuable notes.

## Current limits

Shelf creates Markdown notes and subfolders. Dragging linked root folders changes their order in Shelf without moving them in the vault; moving files or nested folders by dragging is not included. **Move to…** moves nested items with a confirmation. The gallery shows images directly inside the selected folder by default and can optionally include subfolders. The gallery does not require Folder as Gallery.

## License

Shelf is free and open source under the [MIT License](LICENSE). You may use, modify, and share it under that license.
