<script>
  import { onDestroy } from 'svelte'

  export let onActiveChange = () => {}
  export let onSessionComplete = () => {}

  const frameSource = `${import.meta.env.BASE_URL}ict/index.html`
  const messageSource = 'cognitive-suite:ict'
  let frame
  let pendingSaves = Promise.resolve()
  let activityVersion = 0

  function handleMessage(event) {
    if (!frame || event.source !== frame.contentWindow || event.data?.source !== messageSource) return
    if (event.origin !== 'null' && event.origin !== window.location.origin) return

    if (event.data.type === 'active-change' || event.data.type === 'ready') {
      const active = Boolean(event.data.active)
      const version = ++activityVersion
      if (active) onActiveChange(true)
      else pendingSaves.then(() => {
        if (version === activityVersion) onActiveChange(false)
      })
    } else if (event.data.type === 'session-complete' && event.data.session) {
      pendingSaves = pendingSaves.then(() => onSessionComplete(event.data.session)).catch(() => {})
    }
  }

  onDestroy(() => {
    activityVersion++
    onActiveChange(false)
  })
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
