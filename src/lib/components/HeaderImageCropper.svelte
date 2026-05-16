<script lang="ts">
	interface Props {
		disabled?: boolean;
		onimagechange: (dataUrl: string | null) => void;
		onimageschange?: (dataUrls: string[]) => void;
		maxImages?: number;
	}

	type CropImage = {
		id: string;
		sourceUrl: string;
		imageElement: HTMLImageElement;
		fileName: string;
		naturalWidth: number;
		naturalHeight: number;
		cropX: number;
		cropY: number;
		zoom: number;
		dataUrl: string | null;
		loaded: boolean;
	};

	const HEADER_WIDTH = 1600;
	const HEADER_HEIGHT = 720;
	const MAX_FILE_BYTES = 8 * 1024 * 1024;
	const JPEG_QUALITY = 0.86;
	const MIN_ZOOM = 1;
	const MAX_ZOOM = 3;

	let { disabled = false, onimagechange, onimageschange, maxImages = 6 }: Props = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let images = $state<CropImage[]>([]);
	let activeId = $state<string | null>(null);
	let error = $state('');
	let renderTimer: ReturnType<typeof setTimeout> | null = null;
	let dragging = $state(false);
	let dragPointerId: number | null = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartCropX = 50;
	let dragStartCropY = 50;
	let activePointers = new Map<number, { x: number; y: number }>();
	let pinchStartDistance = 0;
	let pinchStartZoom = 1;
	let pinching = false;

	const hasImage = $derived(images.length > 0);
	const activeImage = $derived(images.find((image) => image.id === activeId) ?? null);

	$effect(() => {
		if (!activeImage?.loaded) return;
		activeImage.cropX;
		activeImage.cropY;
		activeImage.zoom;
		scheduleRender();
	});

	$effect(() => {
		return () => {
			if (renderTimer) clearTimeout(renderTimer);
			for (const image of images) URL.revokeObjectURL(image.sourceUrl);
		};
	});

	function emitImages(nextImages = images) {
		const dataUrls = nextImages
			.map((image) => image.dataUrl)
			.filter((dataUrl): dataUrl is string => Boolean(dataUrl));
		onimagechange(dataUrls[0] ?? null);
		onimageschange?.(dataUrls);
	}

	function updateImage(id: string, patch: Partial<CropImage>) {
		images = images.map((image) => (image.id === id ? { ...image, ...patch } : image));
	}

	function clampCrop(value: number) {
		return Math.min(100, Math.max(0, value));
	}

	function clampZoom(value: number) {
		return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
	}

	function pointerDistance() {
		const points = [...activePointers.values()];
		if (points.length < 2) return 0;
		return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
	}

	function validateFile(file: File) {
		if (!file.type.startsWith('image/')) return 'Choose JPEG, PNG, or WebP images.';
		if (file.size > MAX_FILE_BYTES) return 'Each image must be under 8 MB.';
		return '';
	}

	function loadCropImage(file: File): Promise<CropImage> {
		return new Promise((resolve, reject) => {
			const sourceUrl = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				const item: CropImage = {
					id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
					sourceUrl,
					imageElement: img,
					fileName: file.name,
					naturalWidth: img.naturalWidth,
					naturalHeight: img.naturalHeight,
					cropX: 50,
					cropY: 50,
					zoom: 1,
					dataUrl: null,
					loaded: true
				};
				item.dataUrl = renderItem(item);
				resolve(item);
			};
			img.onerror = () => {
				URL.revokeObjectURL(sourceUrl);
				reject(new Error('Could not read one of those images.'));
			};
			img.src = sourceUrl;
		});
	}

	async function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (files.length === 0) return;

		error = '';
		const availableSlots = Math.max(0, maxImages - images.length);
		const selectedFiles = files.slice(0, availableSlots);
		if (selectedFiles.length < files.length) {
			error = `You can add up to ${maxImages} images.`;
		}

		for (const file of selectedFiles) {
			const validationError = validateFile(file);
			if (validationError) {
				error = validationError;
				input.value = '';
				return;
			}
		}

		try {
			const loadedImages = await Promise.all(selectedFiles.map(loadCropImage));
			const nextImages = [...images, ...loadedImages];
			images = nextImages;
			activeId = activeId ?? loadedImages[0]?.id ?? null;
			emitImages(nextImages);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not read one of those images.';
		} finally {
			input.value = '';
		}
	}

	function renderItem(image: CropImage) {
		const canvas = document.createElement('canvas');
		canvas.width = HEADER_WIDTH;
		canvas.height = HEADER_HEIGHT;

		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		ctx.fillStyle = '#f7f7f9';
		ctx.fillRect(0, 0, HEADER_WIDTH, HEADER_HEIGHT);

		const scale =
			Math.max(HEADER_WIDTH / image.naturalWidth, HEADER_HEIGHT / image.naturalHeight) *
			image.zoom;
		const drawWidth = image.naturalWidth * scale;
		const drawHeight = image.naturalHeight * scale;
		const offsetX = -Math.max(0, drawWidth - HEADER_WIDTH) * (image.cropX / 100);
		const offsetY = -Math.max(0, drawHeight - HEADER_HEIGHT) * (image.cropY / 100);

		ctx.drawImage(image.imageElement, offsetX, offsetY, drawWidth, drawHeight);
		return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
	}

	function scheduleRender() {
		if (renderTimer) clearTimeout(renderTimer);
		renderTimer = setTimeout(renderActiveImage, 60);
	}

	function renderActiveImage() {
		if (!activeImage?.loaded) return;
		const dataUrl = renderItem(activeImage);
		if (!dataUrl) return;
		const nextImages = images.map((image) =>
			image.id === activeImage.id ? { ...image, dataUrl } : image
		);
		images = nextImages;
		emitImages(nextImages);
	}

	function previewMetrics(rect: DOMRect, image: CropImage) {
		const headerAspect = HEADER_WIDTH / HEADER_HEIGHT;
		const sourceAspect = image.naturalWidth / image.naturalHeight;
		const baseWidthPct = sourceAspect > headerAspect ? (sourceAspect / headerAspect) * 100 : 100;
		const baseHeightPct = sourceAspect > headerAspect ? 100 : (headerAspect / sourceAspect) * 100;
		const displayWidth = rect.width * (baseWidthPct / 100) * image.zoom;
		const displayHeight = rect.height * (baseHeightPct / 100) * image.zoom;

		return {
			movableX: Math.max(0, displayWidth - rect.width),
			movableY: Math.max(0, displayHeight - rect.height)
		};
	}

	function previewImageStyle(image: CropImage) {
		const headerAspect = HEADER_WIDTH / HEADER_HEIGHT;
		const sourceAspect = image.naturalWidth / image.naturalHeight;
		const baseWidthPct = sourceAspect > headerAspect ? (sourceAspect / headerAspect) * 100 : 100;
		const baseHeightPct = sourceAspect > headerAspect ? 100 : (headerAspect / sourceAspect) * 100;
		const widthPct = baseWidthPct * image.zoom;
		const heightPct = baseHeightPct * image.zoom;
		const leftPct = -Math.max(0, widthPct - 100) * (image.cropX / 100);
		const topPct = -Math.max(0, heightPct - 100) * (image.cropY / 100);

		return `width:${widthPct}%;height:${heightPct}%;left:${leftPct}%;top:${topPct}%;`;
	}

	function handleCropPointerDown(event: PointerEvent) {
		if (disabled || !activeImage) return;
		const target = event.currentTarget as HTMLElement;
		activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		target.setPointerCapture(event.pointerId);

		if (activePointers.size >= 2) {
			dragging = false;
			dragPointerId = null;
			pinching = true;
			pinchStartDistance = pointerDistance();
			pinchStartZoom = activeImage.zoom;
			return;
		}

		const { movableX, movableY } = previewMetrics(target.getBoundingClientRect(), activeImage);
		if (movableX === 0 && movableY === 0) return;

		dragging = true;
		dragPointerId = event.pointerId;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStartCropX = activeImage.cropX;
		dragStartCropY = activeImage.cropY;
	}

	function handleCropPointerMove(event: PointerEvent) {
		if (activePointers.has(event.pointerId)) {
			activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}
		if (!activeImage) return;

		if (pinching && activePointers.size >= 2 && pinchStartDistance > 0) {
			event.preventDefault();
			const distance = pointerDistance();
			updateImage(activeImage.id, {
				zoom: clampZoom(pinchStartZoom * (distance / pinchStartDistance))
			});
			return;
		}

		if (!dragging || dragPointerId !== event.pointerId) return;
		const target = event.currentTarget as HTMLElement;
		const { movableX, movableY } = previewMetrics(target.getBoundingClientRect(), activeImage);
		const dx = event.clientX - dragStartX;
		const dy = event.clientY - dragStartY;

		updateImage(activeImage.id, {
			cropX: movableX > 0 ? clampCrop(dragStartCropX - (dx / movableX) * 100) : activeImage.cropX,
			cropY: movableY > 0 ? clampCrop(dragStartCropY - (dy / movableY) * 100) : activeImage.cropY
		});
	}

	function endCropDrag(event: PointerEvent) {
		const target = event.currentTarget as HTMLElement;
		activePointers.delete(event.pointerId);
		if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);

		if (pinching && activePointers.size === 1 && activeImage) {
			const [remainingPointerId, point] = [...activePointers.entries()][0];
			pinching = false;
			dragging = true;
			dragPointerId = remainingPointerId;
			dragStartX = point.x;
			dragStartY = point.y;
			dragStartCropX = activeImage.cropX;
			dragStartCropY = activeImage.cropY;
			return;
		}

		if (dragPointerId === event.pointerId || activePointers.size === 0) {
			dragging = false;
			dragPointerId = null;
			pinching = false;
			pinchStartDistance = 0;
		}
	}

	function handleCropKeydown(event: KeyboardEvent) {
		if (disabled || !activeImage) return;
		const step = event.shiftKey ? 8 : 2;
		if (event.key === 'ArrowLeft') updateImage(activeImage.id, { cropX: clampCrop(activeImage.cropX - step) });
		else if (event.key === 'ArrowRight') updateImage(activeImage.id, { cropX: clampCrop(activeImage.cropX + step) });
		else if (event.key === 'ArrowUp') updateImage(activeImage.id, { cropY: clampCrop(activeImage.cropY - step) });
		else if (event.key === 'ArrowDown') updateImage(activeImage.id, { cropY: clampCrop(activeImage.cropY + step) });
		else return;
		event.preventDefault();
	}

	function handleCropWheel(event: WheelEvent) {
		if (!activeImage) return;
		event.preventDefault();
		const step = event.deltaY > 0 ? -0.08 : 0.08;
		updateImage(activeImage.id, { zoom: clampZoom(activeImage.zoom + step) });
	}

	function moveImage(id: string, direction: -1 | 1) {
		const index = images.findIndex((image) => image.id === id);
		const nextIndex = index + direction;
		if (disabled || index < 0 || nextIndex < 0 || nextIndex >= images.length) return;
		const nextImages = [...images];
		const [movedImage] = nextImages.splice(index, 1);
		nextImages.splice(nextIndex, 0, movedImage);
		images = nextImages;
		activeId = id;
		emitImages(nextImages);
	}

	function removeImage(id: string) {
		const image = images.find((item) => item.id === id);
		if (image) URL.revokeObjectURL(image.sourceUrl);
		const nextImages = images.filter((item) => item.id !== id);
		images = nextImages;
		if (activeId === id) activeId = nextImages[0]?.id ?? null;
		if (nextImages.length === 0) error = '';
		emitImages(nextImages);
	}

	function clearImages() {
		for (const image of images) URL.revokeObjectURL(image.sourceUrl);
		images = [];
		activeId = null;
		error = '';
		dragging = false;
		dragPointerId = null;
		activePointers = new Map();
		pinching = false;
		pinchStartDistance = 0;
		if (fileInput) fileInput.value = '';
		emitImages([]);
	}
</script>

<div class="header-image-field">
	<div class="upload-row">
		<label class="btn upload-btn" class:disabled for="header-image-input">
			{hasImage ? 'Add more' : 'Add images'}
		</label>
		<input
			bind:this={fileInput}
			id="header-image-input"
			class="file-input"
			type="file"
			accept="image/png,image/jpeg,image/webp"
			multiple
			disabled={disabled || images.length >= maxImages}
			onchange={handleFileChange}
		/>

		{#if hasImage}
			<button type="button" class="btn remove-btn" disabled={disabled} onclick={clearImages}>
				Remove all
			</button>
			<span class="image-count muted">{images.length}/{maxImages}</span>
		{/if}
	</div>

	{#if error}
		<p class="error-text image-error">{error}</p>
	{/if}

	{#if activeImage}
		<div class="cropper">
			<div class="crop-preview">
				<div
					class="crop-stage"
					class:dragging
					role="application"
					tabindex={disabled ? -1 : 0}
					aria-label="Drag to reposition selected image crop"
					onpointerdown={handleCropPointerDown}
					onpointermove={handleCropPointerMove}
					onpointerup={endCropDrag}
					onpointercancel={endCropDrag}
					onkeydown={handleCropKeydown}
					onwheel={handleCropWheel}
				>
					<img src={activeImage.sourceUrl} alt="" style={previewImageStyle(activeImage)} draggable="false" />
					<div class="crop-grid" aria-hidden="true"></div>
				</div>
			</div>

			{#if images.length > 1}
				<div class="thumb-strip" aria-label="Selected images">
					{#each images as image, index (image.id)}
						<div class="thumb-cell">
							<button
								type="button"
								class="thumb"
								class:active={image.id === activeImage.id}
								onclick={() => (activeId = image.id)}
								disabled={disabled}
								aria-label={`Edit image ${index + 1}`}
							>
								<img src={image.dataUrl ?? image.sourceUrl} alt="" />
								<span>{index + 1}</span>
							</button>
							{#if image.id === activeImage.id}
								<div class="thumb-actions">
									<button
										type="button"
										disabled={disabled || index === 0}
										aria-label={`Move image ${index + 1} earlier`}
										onclick={() => moveImage(image.id, -1)}
									>
										&lt;
									</button>
									<button
										type="button"
										disabled={disabled || index === images.length - 1}
										aria-label={`Move image ${index + 1} later`}
										onclick={() => moveImage(image.id, 1)}
									>
										&gt;
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<div class="crop-controls">
				<div class="crop-actions">
					<p class="crop-hint muted">Drag to reposition. Scroll or pinch to zoom. Use arrows for fine adjustment.</p>
					<button type="button" class="remove-image-btn" disabled={disabled} onclick={() => removeImage(activeImage.id)}>
						Remove image
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.header-image-field {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.upload-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.upload-btn,
	.remove-btn {
		padding: 9px 14px;
		font-size: 13px;
	}

	.upload-btn {
		cursor: pointer;
	}

	.upload-btn.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.image-count {
		font-size: 12px;
		font-weight: 650;
	}

	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.remove-btn {
		color: var(--text-2);
	}

	.image-error {
		margin: 0;
	}

	.cropper {
		display: grid;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}

	.crop-preview {
		position: relative;
		aspect-ratio: 20 / 9;
		width: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		overflow: hidden;
	}

	.crop-stage {
		position: absolute;
		inset: 0;
		cursor: grab;
		touch-action: none;
		user-select: none;
		background: var(--surface-3);
	}

	.crop-stage:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.crop-stage.dragging {
		cursor: grabbing;
	}

	.crop-stage img {
		position: absolute;
		display: block;
		max-width: none;
		object-fit: fill;
		pointer-events: none;
		will-change: left, top, width, height;
	}

	.crop-grid {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background:
			linear-gradient(to right, transparent 33.1%, rgba(255, 255, 255, 0.52) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255, 255, 255, 0.52) 66.6%, transparent 66.9%),
			linear-gradient(to bottom, transparent 33.1%, rgba(255, 255, 255, 0.52) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255, 255, 255, 0.52) 66.6%, transparent 66.9%);
		opacity: 0;
		transition: opacity 0.14s ease;
	}

	.crop-stage:hover .crop-grid,
	.crop-stage:focus-visible .crop-grid,
	.crop-stage.dragging .crop-grid {
		opacity: 1;
	}

	.thumb-strip {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 76px;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
	}

	.thumb-cell {
		display: grid;
		gap: 5px;
		min-width: 0;
	}

	.thumb {
		position: relative;
		aspect-ratio: 20 / 9;
		width: 100%;
		padding: 0;
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		background: var(--surface);
		overflow: hidden;
	}

	.thumb.active {
		border-color: var(--accent);
	}

	.thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb span {
		position: absolute;
		right: 4px;
		bottom: 3px;
		min-width: 16px;
		height: 16px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: rgba(20, 20, 26, 0.72);
		color: #fff;
		font-size: 10px;
		font-weight: 800;
	}

	.thumb-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}

	.thumb-actions button {
		height: 22px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-2);
		font-size: 12px;
		font-weight: 800;
		line-height: 1;
	}

	.thumb-actions button:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.thumb-actions button:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	.crop-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.crop-hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
	}

	.remove-image-btn {
		border: none;
		background: none;
		color: var(--dispute);
		font-size: 12px;
		font-weight: 700;
		padding: 0;
	}

	@media (max-width: 560px) {
		.crop-actions {
			flex-direction: column;
		}
	}
</style>
