# Shelf 0.2.0

This release adds six ways to work with a focused part of an Obsidian vault:

- Move notes and nested folders to another folder in the active shelf, with a destination confirmation.
- Include nested folders in a gallery and see each image's source folder.
- Create image collections that store references to vault images.
- Link the current note's parent folder from the command palette.
- Resume tree navigation from the saved Obsidian workspace layout.
- Create tag shelves that group matching Markdown notes by source folder.

It also includes fixes for saving and reloading shelf data, folder overlap checks, vault and gallery updates, and lightbox focus.

Install or update by placing the attached `main.js`, `manifest.json`, and `styles.css` in `<vault>/.obsidian/plugins/shelf/`. Keep any existing `data.json` when updating; it contains your shelves and settings. Restart Obsidian and enable Shelf in Community plugins.

Shelf requires Obsidian Desktop 1.13.0 or newer. It is not yet in the community plugin catalog.
