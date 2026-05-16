<script lang="ts">
	interface Props {
		disabled?: boolean;
		onimagechange: (dataUrl: string | null) => void;
	}

	const HEADER_WIDTH = 1600;
	const HEADER_HEIGHT = 720;
	const MAX_FILE_BYTES = 8 * 1024 * 1024;
	const JPEG_QUALITY = 0.86;

	let { disabled = false, onimagechange }: Props = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let sourceImage = $state<HTMLImageElement | null>(null);
	let sourceUrl = $state<string | null>(null);
	let sourceLoaded = $state(false);
	let sourceNaturalWidth = $state(0);
	let sourceNaturalHeight = $state(0);
	let cropX = $state(50);
	let cropY = $state(50);
	let zoom = $state(1);
	let error = $state('');
	let renderTimer: ReturnType<typeof setTimeout> | null = null;
	let dragging = $state(false);
	let dragPointerId: number | null = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartCropX = 50;
	let dragStartCropY = 50;

	const hasImage = $derived(sourceUrl !== null);

	$effect(() => {
		if (!sourceLoaded) return;
		cropX;
		cropY;
		zoom;
		scheduleRender();
	});

	$effect(() => {
		return () => {
			if (renderTimer) clearTimeout(renderTimer);
			if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		};
	});

	function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		error = '';

		if (!file.type.startsWith('image/')) {
			error = 'Choose a JPEG, PNG, or WebP image.';
			input.value = '';
			return;
		}

		if (file.size > MAX_FILE_BYTES) {
			error = 'Choose an image under 8 MB.';
			input.value = '';
			return;
		}

		if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		sourceUrl = URL.createObjectURL(file);
		sourceLoaded = false;
		sourceNaturalWidth = 0;
		sourceNaturalHeight = 0;
		cropX = 50;
		cropY = 50;
		zoom = 1;
		onimagechange(null);
	}

	function handleImageLoad() {
		if (sourceImage) {
			sourceNaturalWidth = sourceImage.naturalWidth;
			sourceNaturalHeight = sourceImage.naturalHeight;
		}
		sourceLoaded = true;
		renderCrop();
	}

	function clampCrop(value: number) {
		return Math.min(100, Math.max(0, value));
	}

	function previewMetrics(rect: DOMRect) {
		if (!sourceNaturalWidth || !sourceNaturalHeight) {
			return { movableX: 0, movableY: 0 };
		}

		const headerAspect = HEADER_WIDTH / HEADER_HEIGHT;
		const sourceAspect = sourceNaturalWidth / sourceNaturalHeight;
		const baseWidthPct = sourceAspect > headerAspect ? (sourceAspect / headerAspect) * 100 : 100;
		const baseHeightPct = sourceAspect > headerAspect ? 100 : (headerAspect / sourceAspect) * 100;
		const displayWidth = rect.width * (baseWidthPct / 100) * zoom;
		const displayHeight = rect.height * (baseHeightPct / 100) * zoom;

		return {
			movableX: Math.max(0, displayWidth - rect.width),
			movableY: Math.max(0, displayHeight - rect.height)
		};
	}

	function previewImageStyle() {
		if (!sourceNaturalWidth || !sourceNaturalHeight) return '';
		const headerAspect = HEADER_WIDTH / HEADER_HEIGHT;
		const sourceAspect = sourceNaturalWidth / sourceNaturalHeight;
		const baseWidthPct = sourceAspect > headerAspect ? (sourceAspect / headerAspect) * 100 : 100;
		const baseHeightPct = sourceAspect > headerAspect ? 100 : (headerAspect / sourceAspect) * 100;
		const widthPct = baseWidthPct * zoom;
		const heightPct = baseHeightPct * zoom;
		const leftPct = -Math.max(0, widthPct - 100) * (cropX / 100);
		const topPct = -Math.max(0, heightPct - 100) * (cropY / 100);

		return `width:${widthPct}%;height:${heightPct}%;left:${leftPct}%;top:${topPct}%;`;
	}

	function handleCropPointerDown(event: PointerEvent) {
		if (disabled || !sourceLoaded) return;
		const target = event.currentTarget as HTMLElement;
		const { movableX, movableY } = previewMetrics(target.getBoundingClientRect());
		if (movableX === 0 && movableY === 0) return;

		dragging = true;
		dragPointerId = event.pointerId;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStartCropX = cropX;
		dragStartCropY = cropY;
		target.setPointerCapture(event.pointerId);
	}

	function handleCropPointerMove(event: PointerEvent) {
		if (!dragging || dragPointerId !== event.pointerId) return;
		const target = event.currentTarget as HTMLElement;
		const { movableX, movableY } = previewMetrics(target.getBoundingClientRect());
		const dx = event.clientX - dragStartX;
		const dy = event.clientY - dragStartY;

		if (movableX > 0) cropX = clampCrop(dragStartCropX - (dx / movableX) * 100);
		if (movableY > 0) cropY = clampCrop(dragStartCropY - (dy / movableY) * 100);
	}

	function endCropDrag(event: PointerEvent) {
		if (dragPointerId !== event.pointerId) return;
		const target = event.currentTarget as HTMLElement;
		dragging = false;
		dragPointerId = null;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
	}

	function handleCropKeydown(event: KeyboardEvent) {
		if (disabled || !sourceLoaded) return;
		const step = event.shiftKey ? 8 : 2;
		if (event.key === 'ArrowLeft') cropX = clampCrop(cropX - step);
		else if (event.key === 'ArrowRight') cropX = clampCrop(cropX + step);
		else if (event.key === 'ArrowUp') cropY = clampCrop(cropY - step);
		else if (event.key === 'ArrowDown') cropY = clampCrop(cropY + step);
		else return;
		event.preventDefault();
	}

	function scheduleRender() {
		if (renderTimer) clearTimeout(renderTimer);
		renderTimer = setTimeout(renderCrop, 60);
	}

	function renderCrop() {
		if (!sourceImage || !sourceLoaded) return;

		const canvas = document.createElement('canvas');
		canvas.width = HEADER_WIDTH;
		canvas.height = HEADER_HEIGHT;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.fillStyle = '#f7f7f9';
		ctx.fillRect(0, 0, HEADER_WIDTH, HEADER_HEIGHT);

		const scale =
			Math.max(HEADER_WIDTH / sourceImage.naturalWidth, HEADER_HEIGHT / sourceImage.naturalHeight) *
			zoom;
		const drawWidth = sourceImage.naturalWidth * scale;
		const drawHeight = sourceImage.naturalHeight * scale;
		const offsetX = -Math.max(0, drawWidth - HEADER_WIDTH) * (cropX / 100);
		const offsetY = -Math.max(0, drawHeight - HEADER_HEIGHT) * (cropY / 100);

		ctx.drawImage(sourceImage, offsetX, offsetY, drawWidth, drawHeight);

		const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
		onimagechange(dataUrl);
	}

	function clearImage() {
		if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		sourceUrl = null;
		sourceLoaded = false;
		sourceNaturalWidth = 0;
		sourceNaturalHeight = 0;
		error = '';
		cropX = 50;
		cropY = 50;
		zoom = 1;
		if (fileInput) fileInput.value = '';
		onimagechange(null);
	}
</script>

<div class="header-image-field">
	<div class="upload-row">
		<label class="btn upload-btn" class:disabled for="header-image-input">
			{hasImage ? 'Change image' : 'Add header image'}
		</label>
		<input
			bind:this={fileInput}
			id="header-image-input"
			class="file-input"
			type="file"
			accept="image/png,image/jpeg,image/webp"
			disabled={disabled}
			onchange={handleFileChange}
		/>

		{#if hasImage}
			<button type="button" class="btn remove-btn" disabled={disabled} onclick={clearImage}>
				Remove
			</button>
		{/if}
	</div>

	{#if error}
		<p class="error-text image-error">{error}</p>
	{/if}

	{#if sourceUrl}
		<img
			bind:this={sourceImage}
			class="source-image"
			src={sourceUrl}
			alt=""
			onload={handleImageLoad}
		/>

		<div class="cropper">
			<div class="crop-preview">
				{#if sourceLoaded && sourceUrl}
					<div
						class="crop-stage"
						class:dragging
						role="application"
						tabindex={disabled ? -1 : 0}
						aria-label="Drag to reposition header crop"
						onpointerdown={handleCropPointerDown}
						onpointermove={handleCropPointerMove}
						onpointerup={endCropDrag}
						onpointercancel={endCropDrag}
						onkeydown={handleCropKeydown}
					>
						<img src={sourceUrl} alt="" style={previewImageStyle()} draggable="false" />
						<div class="crop-grid" aria-hidden="true"></div>
					</div>
				{:else}
					<span class="muted">Preparing image...</span>
				{/if}
			</div>

			<div class="crop-controls">
				<label>
					<span>Zoom</span>
					<input type="range" min="1" max="3" step="0.01" bind:value={zoom} disabled={disabled} />
				</label>
				<p class="crop-hint muted">Drag the image to reposition the crop. Use arrow keys for fine adjustment.</p>
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

	.file-input,
	.source-image {
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
		display: flex;
		align-items: center;
		justify-content: center;
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

	.crop-controls {
		display: grid;
		gap: 10px;
	}

	.crop-controls label {
		display: grid;
		grid-template-columns: 120px minmax(0, 1fr);
		align-items: center;
		gap: 12px;
		font-size: 12px;
		font-weight: 650;
		color: var(--text-2);
	}

	.crop-controls input {
		width: 100%;
		accent-color: var(--accent);
	}

	.crop-hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
	}

	@media (max-width: 560px) {
		.crop-controls label {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
