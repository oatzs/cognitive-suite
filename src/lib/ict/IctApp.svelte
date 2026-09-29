<script>
  import { onDestroy } from 'svelte'

  export let onActiveChange = () => {}

  const frameSource = `${import.meta.env.BASE_URL}ict/index.html`
  const messageSource = 'cognitive-suite:ict'
  let frame

  function handleMessage(event) {
    if (!frame || event.source !== frame.contentWindow || event.data?.source !== messageSource) return
    if (event.origin !== 'null' && event.origin !== window.location.origin) return

    if (event.data.type === 'active-change' || event.data.type === 'ready') {
      onActiveChange(Boolean(event.data.active))
    }
  }

  onDestroy(() => onActiveChange(false))
</script>

<svelte:window on:message={handleMessage} />

<iframe
  bind:this={frame}
  src={frameSource}
  title="Context-Dependent Inhibitory Control Training"
  class="h-full w-full border-0 bg-[#0b1019]"
  allow="autoplay"
  data-testid="ict-frame"
></iframe>
