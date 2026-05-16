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
	let previewUrl = $state<string | null>(null);
	let sourceLoaded = $state(false);
	let cropX = $state(50);
	let cropY = $state(50);
	let zoom = $state(1);
	let error = $state('');
	let renderTimer: ReturnType<typeof setTimeout> | null = null;

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
		previewUrl = null;
		cropX = 50;
		cropY = 50;
		zoom = 1;
		onimagechange(null);
	}

	function handleImageLoad() {
		sourceLoaded = true;
		renderCrop();
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
		previewUrl = dataUrl;
		onimagechange(dataUrl);
	}

	function clearImage() {
		if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		sourceUrl = null;
		sourceLoaded = false;
		previewUrl = null;
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
				{#if previewUrl}
					<img src={previewUrl} alt="Cropped header preview" />
				{:else}
					<span class="muted">Preparing image...</span>
				{/if}
			</div>

			<div class="crop-controls">
				<label>
					<span>Zoom</span>
					<input type="range" min="1" max="3" step="0.01" bind:value={zoom} disabled={disabled} />
				</label>
				<label>
					<span>Horizontal crop</span>
					<input type="range" min="0" max="100" step="1" bind:value={cropX} disabled={disabled} />
				</label>
				<label>
					<span>Vertical crop</span>
					<input type="range" min="0" max="100" step="1" bind:value={cropY} disabled={disabled} />
				</label>
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

	.crop-preview img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
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

	@media (max-width: 560px) {
		.crop-controls label {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
