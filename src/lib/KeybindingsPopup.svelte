<script>
  import { Keyboard } from "@lucide/svelte"
  import Keybindings from "./Keybindings.svelte"
  export let disabled = false
  let show = false
  const openModal = async () => {
    if (disabled) return
    show = true
  }

  $: if (disabled) show = false

  const closeModal = () => {
    show = false
  }

  const handleKeydown = (event) => {
    if (event.key === "Escape") closeModal()
  }

</script>

<svelte:window on:keydown={handleKeydown} />
<button class="btn btn-primary flex items-center justify-center" on:click={openModal} {disabled}>
  Keybindings
  <Keyboard class="btn btn-square btn-ghost h-8 lg:h-6" />
</button>


{#if show}
  <div class="modal modal-open" role="dialog" aria-modal="true" aria-label="Keybindings">
    <button type="button" class="fixed inset-0 cursor-default" aria-label="Close keybindings" on:click={closeModal}></button>
    <div class="modal-box relative">
      <Keybindings />
      <div class="prose grid grid-cols-2 gap-2">
        <div><span class="text-black dark:text-white">Space:</span> Start Game</div>
        <div><span class="text-black dark:text-white">Esc:</span> End Game</div>
        <div><span class="text-black dark:text-white">PgDown:</span> Next Mode</div>
        <div><span class="text-black dark:text-white">PgUp:</span> Previous Mode</div>
      </div>
    </div>
  </div>
{/if}
