import { App, TFile } from 'obsidian';

/** Full-screen image preview with navigation, zoom, pan and a thumbnail strip. */
export class GalleryLightbox {
	private readonly overlay: HTMLElement;
	private readonly imageEl: HTMLImageElement;
	private readonly nameEl: HTMLElement;
	private readonly zoomEl: HTMLElement;
	private readonly thumbs: HTMLButtonElement[] = [];
	private readonly events = new AbortController();
	private index: number;
	private zoom = 1;
	private x = 0;
	private y = 0;
	private dragging = false;
	private pointerX = 0;
	private pointerY = 0;
	private lastWheel = 0;

	constructor(
		private readonly app: App,
		host: HTMLElement,
		private readonly images: TFile[],
		initialIndex: number,
		private readonly showFileMenu: (file: TFile, event: MouseEvent) => void,
		private readonly onClose: () => void,
	) {
		this.index = Math.max(0, initialIndex);
		const doc = host.ownerDocument;
		const win = doc.defaultView;
		this.overlay = doc.body.createDiv({ cls: 'shelf-gallery-lightbox' });
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', 'Image preview');
		this.overlay.tabIndex = -1;

		const toolbar = this.overlay.createDiv({ cls: 'shelf-gallery-lightbox-toolbar' });
		this.nameEl = toolbar.createSpan({ cls: 'shelf-gallery-lightbox-name' });
		this.zoomEl = toolbar.createSpan({ cls: 'shelf-gallery-lightbox-zoom' });
		const closeButton = toolbar.createEl('button', {
			text: 'Close', attr: { type: 'button', 'aria-label': 'Close image preview' },
		});
		closeButton.addEventListener('click', () => this.close());

		const stage = this.overlay.createDiv({ cls: 'shelf-gallery-lightbox-stage' });
		this.imageEl = stage.createEl('img', { cls: 'shelf-gallery-lightbox-image' });
		this.imageEl.alt = '';
		this.imageEl.addEventListener('mousedown', (event) => this.startPan(event));
		this.imageEl.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			const file = this.images[this.index];
			if (file) this.showFileMenu(file, event);
		});
		stage.addEventListener('click', (event) => {
			if (event.target === stage) this.close();
		});

		const previous = stage.createEl('button', {
			cls: 'shelf-gallery-lightbox-previous', text: '‹',
			attr: { type: 'button', 'aria-label': 'Previous image' },
		});
		previous.addEventListener('click', () => this.move(-1));
		const next = stage.createEl('button', {
			cls: 'shelf-gallery-lightbox-next', text: '›',
			attr: { type: 'button', 'aria-label': 'Next image' },
		});
		next.addEventListener('click', () => this.move(1));

		const strip = this.overlay.createDiv({ cls: 'shelf-gallery-lightbox-strip' });
		for (const [index, file] of images.entries()) {
			const button = strip.createEl('button', {
				cls: 'shelf-gallery-lightbox-thumb',
				attr: { type: 'button', 'aria-label': `Show ${file.name}` },
			});
			const image = button.createEl('img');
			image.src = app.vault.getResourcePath(file);
			image.alt = '';
			image.loading = 'lazy';
			button.addEventListener('click', () => this.select(index));
			this.thumbs.push(button);
		}

		this.overlay.addEventListener('click', (event) => {
			if (event.target === this.overlay) this.close();
		});
		this.overlay.addEventListener('wheel', (event) => this.onWheel(event), {
			passive: false, signal: this.events.signal,
		});
		win?.addEventListener('keydown', (event) => this.onKeyDown(event), { signal: this.events.signal });
		win?.addEventListener('mousemove', (event) => this.onMouseMove(event), { signal: this.events.signal });
		win?.addEventListener('mouseup', () => this.stopPan(), { signal: this.events.signal });
		this.select(this.index);
		this.overlay.focus();
	}

	close(): void {
		if (!this.overlay.isConnected) return;
		this.events.abort();
		this.overlay.remove();
		this.onClose();
	}

	private select(index: number): void {
		const file = this.images[index];
		if (!file) return;
		this.index = index;
		this.imageEl.src = this.app.vault.getResourcePath(file);
		this.imageEl.alt = file.name;
		this.nameEl.setText(`${file.name} (${index + 1}/${this.images.length})`);
		this.setZoom(1);
		for (const [thumbIndex, thumb] of this.thumbs.entries()) {
			thumb.toggleClass('is-active', thumbIndex === index);
		}
		this.thumbs[index]?.scrollIntoView({ block: 'nearest', inline: 'center' });
	}

	private move(delta: number): void {
		this.select((this.index + delta + this.images.length) % this.images.length);
	}

	private setZoom(zoom: number): void {
		this.zoom = Math.max(1, Math.min(5, zoom));
		if (this.zoom === 1) {
			this.x = 0;
			this.y = 0;
		}
		this.zoomEl.setText(`${Math.round(this.zoom * 100)}%`);
		this.updateTransform();
	}

	private updateTransform(): void {
		this.imageEl.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.zoom})`;
		this.imageEl.toggleClass('is-zoomed', this.zoom > 1);
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			this.close();
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			this.move(event.key === 'ArrowLeft' ? -1 : 1);
		} else if (event.key === 'ArrowUp' || event.key === '+' || event.key === '=') {
			event.preventDefault();
			this.setZoom(this.zoom + 0.2);
		} else if (event.key === 'ArrowDown' || event.key === '-') {
			event.preventDefault();
			this.setZoom(this.zoom - 0.2);
		} else if (event.key === '0') {
			this.setZoom(1);
		}
	}

	private onWheel(event: WheelEvent): void {
		event.preventDefault();
		const now = Date.now();
		if (now - this.lastWheel < 250) return;
		this.lastWheel = now;
		this.move(event.deltaY > 0 ? 1 : -1);
	}

	private startPan(event: MouseEvent): void {
		if (event.button !== 0 || this.zoom <= 1) return;
		event.preventDefault();
		this.dragging = true;
		this.pointerX = event.clientX - this.x;
		this.pointerY = event.clientY - this.y;
	}

	private onMouseMove(event: MouseEvent): void {
		if (!this.dragging) return;
		this.x = event.clientX - this.pointerX;
		this.y = event.clientY - this.pointerY;
		this.updateTransform();
	}

	private stopPan(): void {
		this.dragging = false;
	}
}
