<script lang="ts">
	let { children } = $props();
</script>

<div class="auth-shell">
	<a class="logo" href="/">
		<span class="logo-dot"></span>
		<span class="gradient-text">BirdsEye</span>
	</a>

	<div class="auth-card card">
		{@render children()}
	</div>

	<p class="tagline">Community news, on the map.</p>
</div>

<style>
	.auth-shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(10px, 2dvh, 18px);
		padding: clamp(16px, 3dvh, 32px) 16px;
		overflow-x: hidden;
		background:
			radial-gradient(900px 500px at 20% -10%, rgba(99, 102, 241, 0.1), transparent),
			radial-gradient(900px 500px at 90% 110%, rgba(236, 72, 153, 0.1), transparent);
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 22px;
		font-weight: 750;
	}
	.logo-dot {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--gradient);
	}
	.auth-card {
		width: 100%;
		max-width: 380px;
		padding: clamp(22px, 3dvh, 28px);
		box-shadow: var(--shadow);
	}
	.tagline {
		color: var(--text-3);
		font-size: 13px;
		margin: 0;
	}
</style>
