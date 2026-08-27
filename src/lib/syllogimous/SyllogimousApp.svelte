<script>
  import { onDestroy } from 'svelte'

  export let onActiveChange = () => {}
  export let onSessionComplete = () => {}
  export let onDataReset = () => {}

  const frameSource = `${import.meta.env.BASE_URL}syllogimous/index.html`
  const messageSource = 'cognitive-suite:syllogimous'
  let frame

  function handleMessage(event) {
    if (!frame || event.source !== frame.contentWindow || event.data?.source !== messageSource) return
    if (event.origin !== 'null' && event.origin !== window.location.origin) return

    if (event.data.type === 'active-change' || event.data.type === 'ready') {
      onActiveChange(Boolean(event.data.active))
    } else if (event.data.type === 'session-complete' && event.data.session) {
      onSessionComplete(event.data.session)
    } else if (event.data.type === 'data-reset') {
      onDataReset()
    }
  }

  onDestroy(() => onActiveChange(false))
</script>

<svelte:window on:message={handleMessage} />

<iframe
  bind:this={frame}
  src={frameSource}
  title="Syllogimous relational reasoning trainer"
  class="h-full w-full border-0 bg-black"
  allow="clipboard-write"
  data-testid="syllogimous-frame"
></iframe>
