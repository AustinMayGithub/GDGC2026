<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in · BirdsEye</title></svelte:head>

<h1>Welcome back</h1>
<p class="muted sub">Sign in to post, vote and comment.</p>

<form
	method="POST"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	<label>
		<span>Email</span>
		<input class="input" name="email" type="email" value={form?.email ?? ''} required />
	</label>
	<label>
		<span>Password</span>
		<input class="input" name="password" type="password" required />
	</label>

	{#if form?.error}
		<p class="error-text">{form.error}</p>
	{/if}

	<button class="btn btn-primary" type="submit" disabled={submitting}>
		{submitting ? 'Signing in…' : 'Sign in'}
	</button>
</form>

<p class="alt">New here? <a href="/auth/signup">Create an account</a></p>

<style>
	.sub {
		margin: 6px 0 20px;
		font-size: 14px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-2);
	}
	.btn-primary {
		margin-top: 4px;
	}
	.alt {
		margin: 18px 0 0;
		font-size: 13px;
		color: var(--text-2);
	}
	.alt a {
		font-weight: 600;
		color: var(--accent);
	}
</style>
