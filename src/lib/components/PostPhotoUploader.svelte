<script lang="ts">
	interface PhotoItem {
		id: string;
		name: string;
		previewUrl: string;
		blob: Blob;
	}

	interface Props {
		disabled?: boolean;
		onphotoschange: (photos: Blob[]) => void;
	}

	const MAX_PHOTOS = 10;
	const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
	const PHOTO_SIZE = 1080;
	const JPEG_QUALITY = 0.86;

	let { disabled = false, onphotoschange }: Props = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let photos = $state<PhotoItem[]>([]);
	let activeIndex = $state(0);
	let error = $state('');
	let processing = $state(false);

	const remainingSlots = $derived(MAX_PHOTOS - photos.length);
	const activePhoto = $derived(photos[activeIndex] ?? null);

	function syncPhotos() {
		onphotoschange(photos.map((photo) => photo.blob));
		if (activeIndex > photos.length - 1) activeIndex = Math.max(photos.length - 1, 0);
	}

	async function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';

		if (files.length === 0) return;

		error = '';
		if (remainingSlots <= 0) {
			error = `You can add up to ${MAX_PHOTOS} photos.`;
			return;
		}

		const selected = files.slice(0, remainingSlots);
		if (files.length > remainingSlots) {
			error = `Only ${remainingSlots} more photo${remainingSlots === 1 ? '' : 's'} can be added.`;
		}

		processing = true;
		try {
			const added: PhotoItem[] = [];
			for (const file of selected) {
				added.push(await preparePhoto(file));
			}
			photos = [...photos, ...added];
			if (photos.length === added.length) activeIndex = 0;
			syncPhotos();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Photo processing failed.';
		} finally {
			processing = false;
		}
	}

	function preparePhoto(file: File): Promise<PhotoItem> {
		if (!file.type.startsWith('image/')) {
			throw new Error('Choose JPEG, PNG, or WebP images.');
		}
		if (file.size > MAX_SOURCE_BYTES) {
			throw new Error('Each photo must be under 12 MB.');
		}

		return new Promise((resolve, reject) => {
			const sourceUrl = URL.createObjectURL(file);
			const image = new Image();

			image.onload = () => {
				URL.revokeObjectURL(sourceUrl);

				const canvas = document.createElement('canvas');
				canvas.width = PHOTO_SIZE;
				canvas.height = PHOTO_SIZE;

				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Could not process this photo.'));
					return;
				}

				const scale = Math.max(PHOTO_SIZE / image.naturalWidth, PHOTO_SIZE / image.naturalHeight);
				const drawWidth = image.naturalWidth * scale;
				const drawHeight = image.naturalHeight * scale;
				const offsetX = (PHOTO_SIZE - drawWidth) / 2;
				const offsetY = (PHOTO_SIZE - drawHeight) / 2;

				ctx.fillStyle = '#f7f7f9';
				ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
				ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

				canvas.toBlob(
					(blob) => {
						if (!blob) {
							reject(new Error('Could not process this photo.'));
							return;
						}

						resolve({
							id: crypto.randomUUID(),
							name: file.name,
							previewUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
							blob
						});
					},
					'image/jpeg',
					JPEG_QUALITY
				);
			};

			image.onerror = () => {
				URL.revokeObjectURL(sourceUrl);
				reject(new Error('One of the selected photos could not be read.'));
			};

			image.src = sourceUrl;
		});
	}

	function removePhoto(id: string) {
		const removedIndex = photos.findIndex((photo) => photo.id === id);
		photos = photos.filter((photo) => photo.id !== id);
		if (removedIndex <= activeIndex) activeIndex = Math.max(activeIndex - 1, 0);
		syncPhotos();
	}
</script>

<div class="photo-uploader">
	<div class="upload-row">
		<label class="btn upload-btn" class:disabled={disabled || remainingSlots <= 0 || processing} for="post-photos-input">
			{photos.length === 0 ? 'Add photos' : 'Add more'}
		</label>
		<input
			bind:this={fileInput}
			id="post-photos-input"
			class="file-input"
			type="file"
			accept="image/png,image/jpeg,image/webp"
			multiple
			disabled={disabled || remainingSlots <= 0 || processing}
			onchange={handleFileChange}
		/>
		<span class="muted photo-count">{photos.length}/{MAX_PHOTOS}</span>
	</div>

	{#if error}
		<p class="error-text image-error">{error}</p>
	{/if}

	{#if processing}
		<p class="muted processing-copy">Preparing photos...</p>
	{/if}

	{#if activePhoto}
		<div class="photo-preview">
			<img src={activePhoto.previewUrl} alt={activePhoto.name} />
			{#if photos.length > 1}
				<div class="preview-count">{activeIndex + 1} / {photos.length}</div>
			{/if}
		</div>

		<div class="thumb-strip" aria-label="Selected photos">
			{#each photos as photo, index (photo.id)}
				<button
					type="button"
					class="thumb"
					class:active={index === activeIndex}
					onclick={() => (activeIndex = index)}
					aria-label={`Preview ${photo.name}`}
				>
					<img src={photo.previewUrl} alt="" />
				</button>
				<button
					type="button"
					class="remove-thumb"
					disabled={disabled}
					onclick={() => removePhoto(photo.id)}
					aria-label={`Remove ${photo.name}`}
				>
					Remove
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.photo-uploader {
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

	.upload-btn {
		padding: 9px 14px;
		font-size: 13px;
		cursor: pointer;
	}

	.upload-btn.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.photo-count,
	.processing-copy,
	.image-error {
		margin: 0;
		font-size: 13px;
	}

	.photo-preview {
		position: relative;
		width: min(360px, 100%);
		aspect-ratio: 1;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		overflow: hidden;
	}

	.photo-preview img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.preview-count {
		position: absolute;
		top: 10px;
		right: 10px;
		padding: 4px 8px;
		border-radius: 999px;
		background: rgba(20, 20, 26, 0.72);
		color: #fff;
		font-size: 12px;
		font-weight: 700;
	}

	.thumb-strip {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
	}

	.thumb {
		width: 58px;
		height: 58px;
		flex: 0 0 auto;
		padding: 0;
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
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

	.remove-thumb {
		align-self: center;
		flex: 0 0 auto;
		border: none;
		background: transparent;
		color: var(--text-2);
		font-size: 12px;
		padding: 0 8px 0 0;
	}

	.remove-thumb:hover {
		color: var(--dispute);
	}
</style>
