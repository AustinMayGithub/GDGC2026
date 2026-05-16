<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		const goingToPost = navigation.to?.route?.id === '/post/[id]';
		if (!goingToPost) document.documentElement.classList.add('nav-back');
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
				document.documentElement.classList.remove('nav-back');
			});
		});
	});
</script>

{@render children()}
