<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign up · BirdsEye</title></svelte:head>

<h1>Create your account</h1>
<p class="muted sub">Join the grapevine. It takes a minute.</p>

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
		<span>Name</span>
		<input class="input" name="displayName" value={form?.displayName ?? ''} required />
	</label>
	<label>
		<span>Email</span>
		<input class="input" name="email" type="email" value={form?.email ?? ''} required />
	</label>
	<label>
		<span>Password</span>
		<input class="input" name="password" type="password" minlength="8" required />
	</label>

	{#if form?.error}
		<p class="error-text">{form.error}</p>
	{/if}

	<button class="btn btn-primary" type="submit" disabled={submitting}>
		{submitting ? 'Creating…' : 'Create account'}
	</button>
</form>

<p class="alt">Already have an account? <a href="/auth/login">Sign in</a></p>

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
