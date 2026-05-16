<script lang="ts">
	import { page } from '$app/stores';
	import logo from '$lib/data/birdseye.png';
</script>

<svelte:head><title>{$page.status} · BirdsEye</title></svelte:head>

<div class="error-shell">
	<a class="logo" href="/">
		<img alt="logo" src={logo} height="24px">
	</a>
	<div class="error-card card">
		<div class="status gradient-text">{$page.status}</div>
		<p class="message">{$page.error?.message ?? 'Something went wrong.'}</p>
		<a class="btn btn-primary" href="/">Back to the map</a>
	</div>
</div>

<style>
	.error-shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 20px;
		padding: 32px 16px;
		background:
			radial-gradient(900px 500px at 20% -10%, rgba(99, 102, 241, 0.1), transparent),
			radial-gradient(900px 500px at 90% 110%, rgba(236, 72, 153, 0.1), transparent);
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 20px;
		font-weight: 750;
	}
	.error-card {
		width: 100%;
		max-width: 380px;
		padding: 36px 28px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		box-shadow: var(--shadow);
	}
	.status {
		font-size: 52px;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
	}
	.message {
		margin: 0;
		color: var(--text-2);
	}
</style>
